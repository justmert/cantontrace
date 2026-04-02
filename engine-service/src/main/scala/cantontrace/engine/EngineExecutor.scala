package cantontrace.engine

import cantontrace.model._
import com.typesafe.config.ConfigFactory
import com.typesafe.scalalogging.LazyLogging

import java.time.Instant
import scala.collection.mutable
import scala.util.{Failure, Success, Try}

// Direct Daml-LF Engine imports (com.digitalasset.daml.lf.*)
import com.digitalasset.daml.lf.engine.{Engine, Error => EngineError}
import com.digitalasset.daml.lf.archive.{Decode, DamlLf}
import com.digitalasset.daml.lf.data.{ImmArray, Ref, Time}
import com.digitalasset.daml.lf.data.Ref.{PackageRef, QualifiedName, FullReference}
import com.digitalasset.daml.lf.value.Value
import com.digitalasset.daml.lf.value.Value.{ContractId, ValueRecord, ValueText}
import com.digitalasset.daml.lf.command.{ApiCommand, ApiCommands}
import com.digitalasset.daml.lf.crypto.Hash
import com.digitalasset.daml.lf.transaction.{
  FatContractInstance, VersionedTransaction, Node,
  SerializationVersion, CreationTime, GlobalKeyWithMaintainers
}
import com.digitalasset.daml.lf.language.{Ast, LanguageMajorVersion}
import com.daml.logging.LoggingContext

/**
 * Core execution engine that wraps the Daml-LF Engine with instrumentation.
 *
 * This implementation attempts to use the real Daml-LF Engine's Result-monad
 * API to observe contract fetches, package lookups, and the final outcome.
 * Each observable callback becomes a TraceStep.
 *
 * When the real engine classes are not available on the classpath, the
 * executor falls back to synthetic tracing that manually simulates the
 * engine's evaluation sequence.
 *
 * When the forked engine with Speedy-machine hooks becomes available,
 * [[InstrumentedEngine]] extends this class to capture expression-level
 * evaluation, authorization checks, guard evaluations, and individual
 * ledger actions.
 *
 * Thread safety: instances are stateless between calls. All mutable state
 * is confined to a single invocation of `trace` or `simulate`.
 */
class EngineExecutor extends LazyLogging {

  /** Maximum number of trace steps before the engine aborts. */
  protected val maxTraceSteps: Int = Try {
    ConfigFactory.load().getInt("cantontrace.engine.max-trace-steps")
  }.getOrElse(10000)

  /**
   * Whether the real Daml-LF Engine classes are available on the classpath.
   * Checked once at construction time to avoid repeated reflection overhead.
   */
  protected val realEngineAvailable: Boolean = {
    try {
      Class.forName("com.digitalasset.daml.lf.engine.Engine")
      Class.forName("com.digitalasset.daml.lf.engine.Result")
      true
    } catch {
      case _: ClassNotFoundException => false
    }
  }

  if (realEngineAvailable) {
    logger.info("Daml-LF Engine classes detected on classpath; real engine path enabled")
  } else {
    logger.error("Daml-LF Engine classes NOT found on classpath — tracing and simulation will fail")
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Execute a command with full instrumentation, returning a step-by-step trace.
   *
   * Attempts to use the real Daml-LF Engine first. If the engine classes are
   * not on the classpath or the engine invocation fails, falls back to
   * synthetic tracing.
   *
   * @param command   the Daml command to execute
   * @param packages  Base64-encoded DALF bytes keyed by package ID
   * @param contracts active contracts from the ACS snapshot
   * @param disclosedContracts additional disclosed contracts
   * @param actAs     parties acting on this command
   * @param readAs    parties with read access
   * @return a complete ExecutionTrace
   */
  def trace(
    command: CommandRequest,
    packages: Map[String, String],
    contracts: Map[String, ContractInfo],
    disclosedContracts: Seq[ContractInfo],
    actAs: Set[String],
    readAs: Set[String]
  ): ExecutionTrace = {
    require(realEngineAvailable, "Daml-LF Engine is not available on the classpath. Cannot trace.")
    traceWithEngine(command, packages, contracts, disclosedContracts, actAs, readAs)
  }

  /**
   * Execute a command without instrumentation (faster, for simulation).
   * Uses the real Daml-LF Engine.
   */
  def simulate(
    command: CommandRequest,
    packages: Map[String, String],
    contracts: Map[String, ContractInfo],
    disclosedContracts: Seq[ContractInfo],
    actAs: Set[String],
    readAs: Set[String]
  ): SimulationResult = {
    require(realEngineAvailable, "Daml-LF Engine is not available on the classpath. Cannot simulate.")
    simulateWithEngine(command, packages, contracts, disclosedContracts, actAs, readAs)
  }

  // -----------------------------------------------------------------------
  // Real Engine path — uses Daml-LF Engine via reflection
  // -----------------------------------------------------------------------

  /**
   * Attempt to trace using the real Daml-LF Engine.
   *
   * Uses the Engine's Result monad to process contract fetches and package
   * lookups, recording each callback as a TraceStep.
   */
  private[engine] def traceWithEngine(
    command: CommandRequest,
    packages: Map[String, String],
    contracts: Map[String, ContractInfo],
    disclosedContracts: Seq[ContractInfo],
    actAs: Set[String],
    readAs: Set[String]
  ): ExecutionTrace = {
    val steps = mutable.ArrayBuffer[TraceStep]()
    val startTime = System.nanoTime()

    val engineResult = tryRealEngine(
      command, packages, contracts, disclosedContracts, actAs, readAs, steps
    )
    engineResult match {
      case Some(trace) => trace
      case None =>
        throw new RuntimeException("Daml-LF Engine invocation returned None — check packages and command format")
    }
  }

  /**
   * Simulate using the real Daml-LF Engine (no step recording).
   */
  private[engine] def simulateWithEngine(
    command: CommandRequest,
    packages: Map[String, String],
    contracts: Map[String, ContractInfo],
    disclosedContracts: Seq[ContractInfo],
    actAs: Set[String],
    readAs: Set[String]
  ): SimulationResult = {
    val engineResult = tryRealEngineSimulation(
      command, packages, contracts, disclosedContracts, actAs, readAs
    )
    engineResult match {
      case Some(result) => result
      case None =>
        throw new RuntimeException("Daml-LF Engine simulation returned None — check packages and command format")
    }
  }

  // -----------------------------------------------------------------------
  // Real Engine path — direct Daml-LF Engine imports
  // -----------------------------------------------------------------------

  /** Type alias for decoded packages — Ast.GenPackage[Ast.Expr] */
  private type Package = Ast.GenPackage[Ast.Expr]

  /**
   * Use the real Daml-LF Engine for tracing.
   *
   * This method:
   *  1. Decodes DALF archives into Package objects via the archive reader
   *  2. Creates an Engine instance with a default configuration
   *  3. Submits the command and calls Result.consume() with instrumented callbacks
   *  4. Records a TraceStep for each contract fetch / package lookup
   *  5. Returns Some(ExecutionTrace) on success, None on failure
   */
  private def tryRealEngine(
    command: CommandRequest,
    packages: Map[String, String],
    contracts: Map[String, ContractInfo],
    disclosedContracts: Seq[ContractInfo],
    actAs: Set[String],
    readAs: Set[String],
    steps: mutable.ArrayBuffer[TraceStep]
  ): Option[ExecutionTrace] = {
    Try {
      val startTime = System.nanoTime()
      var stepNumber = 0

      // --- Step 1: Decode DALF packages (collapsed into a single step) ---
      val decodedPackages = mutable.Map[String, Package]()
      val decodeFailures = mutable.ArrayBuffer[String]()

      packages.foreach { case (pkgId, base64Dalf) =>
        Try {
          val dalfBytes = java.util.Base64.getDecoder.decode(base64Dalf)
          val archive = DamlLf.Archive.parseFrom(dalfBytes)
          val (decodedPkgId, pkg) = Decode.assertDecodeArchive(archive)
          decodedPackages(decodedPkgId) = pkg
        } match {
          case Success(_) => // ok
          case Failure(ex) =>
            decodeFailures += s"$pkgId: ${ex.getMessage}"
        }
      }

      stepNumber += 1
      val allLoaded = decodeFailures.isEmpty
      steps += TraceStep(
        stepNumber = stepNumber,
        stepType = "fetch_package",
        sourceLocation = None,
        summary = if (allLoaded) s"Loaded ${decodedPackages.size} packages"
                  else s"Loaded ${decodedPackages.size} packages (${decodeFailures.size} failed)",
        variables = Map(
          "packageCount" -> packages.size.toString,
          "decodedCount" -> decodedPackages.size.toString,
          "failedCount" -> decodeFailures.size.toString
        ),
        context = PackageFetchContext(packageId = s"${decodedPackages.size} packages", found = allLoaded),
        passed = allLoaded,
        error = if (decodeFailures.nonEmpty) Some(decodeFailures.mkString("; ")) else None
      )

      // --- Step 2: Create Engine instance ---
      stepNumber += 1
      val engine = Engine.DevEngine(LanguageMajorVersion.V2)

      steps += TraceStep(
        stepNumber = stepNumber,
        stepType = "evaluate_expression",
        sourceLocation = None,
        summary = "Initialize Daml-LF Engine (V2 Dev)",
        variables = Map(
          "engineVersion" -> engine.info.toString,
          "packagesLoaded" -> decodedPackages.size.toString
        ),
        context = ExpressionContext(
          expressionType = "engine_initialization",
          variables = Map("packagesLoaded" -> decodedPackages.size.toString)
        ),
        passed = true,
        error = None
      )

      // --- Step 3: Pre-load decoded packages into the engine ---
      decodedPackages.foreach { case (pkgId, pkg) =>
        engine.preloadPackage(Ref.PackageId.assertFromString(pkgId), pkg)
      }

      // --- Step 4: Build and submit the command ---
      stepNumber += 1
      val apiCmd = buildApiCommand(command, decodedPackages)
      val ledgerTime = Time.Timestamp.assertFromInstant(Instant.now())
      val cmdsReference = s"cantontrace-cmd-${System.nanoTime()}"
      val apiCommands = ApiCommands(
        commands = ImmArray.from(Seq(apiCmd)),
        ledgerEffectiveTime = ledgerTime,
        commandsReference = cmdsReference
      )
      val submissionSeed = Hash.hashPrivateKey(s"cantontrace-${System.nanoTime()}")

      implicit val loggingContext: LoggingContext = LoggingContext.ForTesting

      val submitResult = engine.submit(
        packageMap = engine.submit$default$1,
        packagePreference = engine.submit$default$2,
        submitters = actAs.map(Ref.Party.assertFromString),
        readAs = readAs.map(Ref.Party.assertFromString),
        cmds = apiCommands,
        participantId = Ref.ParticipantId.assertFromString("cantontrace-engine"),
        submissionSeed = submissionSeed,
        prefetchKeys = Seq.empty,
        engineLogger = engine.submit$default$9
      )

      // --- Step 5: Consume the Result monad with instrumented callbacks ---
      val contractLookup: PartialFunction[ContractId, FatContractInstance] = {
        case cid =>
          stepNumber += 1
          val cidStr = cid.coid
          val contractOpt = contracts.get(cidStr).orElse(
            disclosedContracts.find(_.contractId == cidStr)
          )
          val source = contractOpt match {
            case Some(_) if contracts.contains(cidStr) => "ACS"
            case Some(_) => "disclosed"
            case None => "not_found"
          }

          steps += TraceStep(
            stepNumber = stepNumber,
            stepType = "fetch_contract",
            sourceLocation = None,
            summary = s"Fetch contract $cidStr (source: $source)",
            variables = Map("contractId" -> cidStr, "source" -> source),
            context = FetchContext(
              contractId = cidStr,
              payload = contractOpt.map(_.payload),
              found = contractOpt.isDefined
            ),
            passed = contractOpt.isDefined,
            error = if (contractOpt.isEmpty) Some(s"Contract $cidStr not found") else None
          )

          contractOpt match {
            case Some(c) => buildFatContractInstance(c, cid, decodedPackages)
            case None =>
              throw new NoSuchElementException(s"Contract $cidStr not found in ACS or disclosed contracts")
          }
      }

      val packageLookup: PartialFunction[String, Package] = {
        case pkgIdStr if decodedPackages.contains(pkgIdStr) =>
          decodedPackages(pkgIdStr)
        case pkgIdStr if packages.contains(pkgIdStr) =>
          stepNumber += 1
          steps += TraceStep(
            stepNumber = stepNumber,
            stepType = "fetch_package",
            sourceLocation = None,
            summary = s"Runtime load package $pkgIdStr",
            variables = Map("packageId" -> pkgIdStr),
            context = PackageFetchContext(packageId = pkgIdStr, found = true),
            passed = true,
            error = None
          )
          val bytes = java.util.Base64.getDecoder.decode(packages(pkgIdStr))
          val archive = DamlLf.Archive.parseFrom(bytes)
          val (decodedId, pkg) = Decode.assertDecodeArchive(archive)
          decodedPackages(decodedId) = pkg
          pkg
      }

      val keyLookup: PartialFunction[GlobalKeyWithMaintainers, ContractId] =
        PartialFunction.empty

      val consumeResult = consumeResult_(
        submitResult, contractLookup, packageLookup, keyLookup
      )

      consumeResult match {
        case Right(txAndMeta) =>
          val (versionedTx, _metadata) = txAndMeta.asInstanceOf[(VersionedTransaction, Any)]
          stepNumber += 1
          steps += TraceStep(
            stepNumber = stepNumber,
            stepType = "evaluate_expression",
            sourceLocation = None,
            summary = "Command evaluation complete",
            variables = Map(
              "commandType" -> command.choice.map(_ => "exercise").getOrElse("create"),
              "templateId" -> command.templateId
            ),
            context = ExpressionContext(
              expressionType = "command_result",
              variables = Map("success" -> "true")
            ),
            passed = true,
            error = None
          )
          val resultTx = convertVersionedTransaction(versionedTx, command, decodedPackages)
          Some(buildTrace(steps.toSeq, Map.empty, sourceAvailable = false, Some(resultTx), None, startTime))

        case Left(engineErr) =>
          val err = engineErr.asInstanceOf[EngineError]
          stepNumber += 1
          val errMsg = err.message
          steps += TraceStep(
            stepNumber = stepNumber,
            stepType = "evaluate_expression",
            sourceLocation = None,
            summary = s"Command evaluation failed: $errMsg",
            variables = Map(
              "commandType" -> command.choice.map(_ => "exercise").getOrElse("create"),
              "templateId" -> command.templateId
            ),
            context = ExpressionContext(
              expressionType = "command_result",
              variables = Map("success" -> "false")
            ),
            passed = false,
            error = Some(errMsg)
          )
          Some(buildTrace(steps.toSeq, Map.empty, sourceAvailable = false, None, Some(errMsg), startTime))
      }
    } match {
      case Success(result) => result
      case Failure(ex) =>
        logger.error(s"Real engine trace failed: ${ex.getClass.getName}: ${ex.getMessage}", ex)
        throw ex
    }
  }

  /**
   * Use the real Daml-LF Engine for simulation (no step recording).
   */
  private def tryRealEngineSimulation(
    command: CommandRequest,
    packages: Map[String, String],
    contracts: Map[String, ContractInfo],
    disclosedContracts: Seq[ContractInfo],
    actAs: Set[String],
    readAs: Set[String]
  ): Option[SimulationResult] = {
    val now = Instant.now().toString
    Try {
      // Decode packages
      val decodedPackages = mutable.Map[String, Package]()
      packages.foreach { case (pkgId, base64Dalf) =>
        val dalfBytes = java.util.Base64.getDecoder.decode(base64Dalf)
        val archive = DamlLf.Archive.parseFrom(dalfBytes)
        val (decodedPkgId, pkg) = Decode.assertDecodeArchive(archive)
        decodedPackages(decodedPkgId) = pkg
      }

      // Create engine and preload
      val engine = Engine.DevEngine(LanguageMajorVersion.V2)
      decodedPackages.foreach { case (pkgId, pkg) =>
        engine.preloadPackage(Ref.PackageId.assertFromString(pkgId), pkg)
      }

      // Build and submit
      val apiCmd = buildApiCommand(command, decodedPackages)
      val ledgerTime = Time.Timestamp.assertFromInstant(Instant.now())
      val apiCommands = ApiCommands(
        commands = ImmArray.from(Seq(apiCmd)),
        ledgerEffectiveTime = ledgerTime,
        commandsReference = s"cantontrace-sim-${System.nanoTime()}"
      )
      val submissionSeed = Hash.hashPrivateKey(s"cantontrace-sim-${System.nanoTime()}")

      implicit val loggingContext: LoggingContext = LoggingContext.ForTesting

      val submitResult = engine.submit(
        packageMap = engine.submit$default$1,
        packagePreference = engine.submit$default$2,
        submitters = actAs.map(Ref.Party.assertFromString),
        readAs = readAs.map(Ref.Party.assertFromString),
        cmds = apiCommands,
        participantId = Ref.ParticipantId.assertFromString("cantontrace-engine"),
        submissionSeed = submissionSeed,
        prefetchKeys = Seq.empty,
        engineLogger = engine.submit$default$9
      )

      // Consume with simple lookups
      val contractLookup: PartialFunction[ContractId, FatContractInstance] = {
        case cid =>
          val cidStr = cid.coid
          val contractOpt = contracts.get(cidStr).orElse(
            disclosedContracts.find(_.contractId == cidStr)
          )
          contractOpt match {
            case Some(c) => buildFatContractInstance(c, cid, decodedPackages)
            case None =>
              throw new NoSuchElementException(s"Contract $cidStr not found")
          }
      }

      val packageLookup: PartialFunction[String, Package] = {
        case pkgIdStr if decodedPackages.contains(pkgIdStr) =>
          decodedPackages(pkgIdStr)
        case pkgIdStr if packages.contains(pkgIdStr) =>
          val bytes = java.util.Base64.getDecoder.decode(packages(pkgIdStr))
          val archive = DamlLf.Archive.parseFrom(bytes)
          val (decodedId, pkg) = Decode.assertDecodeArchive(archive)
          decodedPackages(decodedId) = pkg
          pkg
      }

      val consumeResult = consumeResult_(
        submitResult, contractLookup, packageLookup, PartialFunction.empty
      )

      consumeResult match {
        case Right(txAndMeta) =>
          val (versionedTx, _) = txAndMeta.asInstanceOf[(VersionedTransaction, Any)]
          Some(SimulationResult(
            success = true,
            transactionTree = Some(convertVersionedTransaction(versionedTx, command, decodedPackages)),
            error = None,
            errorCategory = None,
            simulatedAt = now,
            atOffset = None,
            stateDriftWarning = "Simulation used a point-in-time ACS snapshot; the live ledger may have diverged."
          ))
        case Left(engineErr) =>
          val err = engineErr.asInstanceOf[EngineError]
          Some(SimulationResult(
            success = false,
            transactionTree = None,
            error = Some(err.message),
            errorCategory = Some("InvalidIndependentOfSystemState"),
            simulatedAt = now,
            atOffset = None,
            stateDriftWarning = "Simulation used a point-in-time ACS snapshot; the live ledger may have diverged."
          ))
      }
    } match {
      case Success(result) => result
      case Failure(ex) =>
        logger.error(s"Real engine simulation failed: ${ex.getClass.getName}: ${ex.getMessage}", ex)
        Some(SimulationResult(
          success = false,
          transactionTree = None,
          error = Some(s"Engine error: ${ex.getClass.getSimpleName}: ${ex.getMessage}"),
          errorCategory = Some("SystemInternalAssumptionViolated"),
          simulatedAt = now,
          atOffset = None,
          stateDriftWarning = "Engine invocation failed — see error above."
        ))
    }
  }

  // -----------------------------------------------------------------------
  // Typed helpers for Daml-LF Engine interaction (direct imports)
  // -----------------------------------------------------------------------

  /**
   * Call Result.consume() bypassing Scala-level access restrictions.
   *
   * The Daml SDK declares consume as private[engine] in Scala source, which
   * restricts access to com.digitalasset.daml.lf.engine. At the JVM level
   * the method is public, so we invoke it via Java reflection.
   */
  private def consumeResult_[A](
    result: com.digitalasset.daml.lf.engine.Result[A],
    contractLookup: PartialFunction[ContractId, FatContractInstance],
    packageLookup: PartialFunction[String, Package],
    keyLookup: PartialFunction[GlobalKeyWithMaintainers, ContractId]
  ): Either[Any, Any] = {
    // Use the static forwarder: Result.consume$(result, pf1, pf2, pf3, f4, f5)
    val resultClass = classOf[com.digitalasset.daml.lf.engine.Result[_]]
    val consumeMethod = resultClass.getMethod(
      "consume$",
      classOf[com.digitalasset.daml.lf.engine.Result[_]],
      classOf[PartialFunction[_, _]],
      classOf[PartialFunction[_, _]],
      classOf[PartialFunction[_, _]],
      classOf[Function1[_, _]],
      classOf[Function2[_, _, _]]
    )

    // Get default values for params 4 and 5 via the static forwarders
    val default4Method = resultClass.getMethod("consume$default$4$", classOf[com.digitalasset.daml.lf.engine.Result[_]])
    val default5Method = resultClass.getMethod("consume$default$5$", classOf[com.digitalasset.daml.lf.engine.Result[_]])

    val hashingFn = default4Method.invoke(null, result)
    val authFn = default5Method.invoke(null, result)

    consumeMethod.invoke(
      null, result, contractLookup, packageLookup, keyLookup, hashingFn, authFn
    ).asInstanceOf[Either[Any, Any]]
  }

  /**
   * Build a typed ApiCommand from our string-based CommandRequest.
   *
   * The template identifier is parsed from "packageId:Module:Entity" format
   * and converted to a FullReference[PackageRef] which Create/Exercise require.
   * Arguments are encoded as ValueRecord with ValueText fields.
   */
  private def buildApiCommand(command: CommandRequest, decodedPackages: mutable.Map[String, Package] = mutable.Map.empty): ApiCommand = {
    val templateParts = command.templateId.split(":")
    require(templateParts.length >= 3,
      s"Template ID '${command.templateId}' must be in Package:Module:Entity format")

    val packageIdStr = templateParts(0)
    val moduleName = templateParts(1)
    val entityName = templateParts(2)

    // Build the FullReference[PackageRef] that ApiCommand expects
    val pkgId = Ref.PackageId.assertFromString(packageIdStr)
    val pkgRef: PackageRef = PackageRef.Id(pkgId)
    val qn = QualifiedName.assertFromString(s"$moduleName:$entityName")
    val templateRef: FullReference[PackageRef] = FullReference(pkgRef, qn)

    command.choice match {
      case Some(choiceName) =>
        // Look up the choice's argument type from the package
        val choiceArgType: Option[Seq[(String, Ast.Type)]] = decodedPackages.get(packageIdStr).flatMap { pkg =>
          val modName = Ref.DottedName.assertFromString(moduleName)
          pkg.modules.get(modName).flatMap { module =>
            val tmplName = Ref.DottedName.assertFromString(entityName)
            module.templates.get(tmplName).flatMap { tmpl =>
              val cn = Ref.ChoiceName.assertFromString(choiceName)
              tmpl.choices.get(cn).flatMap { choice =>
                // The choice arg type is typically a record defined in the same module
                resolveRecordFields(choice.argBinder._2, module, pkg)
              }
            }
          }
        }

        val argValue = choiceArgType match {
          case Some(fieldTypes) =>
            val entries: Seq[(Option[Ref.Name], Value)] = fieldTypes.map { case (name, typ) =>
              val raw = command.arguments.getOrElse(name, "")
              (Some(Ref.Name.assertFromString(name)): Option[Ref.Name], stringToTypedValue(raw, typ))
            }
            ValueRecord(None, ImmArray.from(entries))
          case None =>
            buildValueRecordTyped(command.arguments)
        }

        val cid = ContractId.assertFromString(command.contractId.getOrElse(
          throw new IllegalArgumentException("contractId is required for Exercise commands")
        ))
        val choiceRef = Ref.ChoiceName.assertFromString(choiceName)
        ApiCommand.Exercise(templateRef, cid, choiceRef, argValue)

      case None =>
        // Create command — look up template fields for proper typing
        val fieldTypes: Option[Seq[(String, Ast.Type)]] = decodedPackages.get(packageIdStr).flatMap { pkg =>
          val modName = Ref.DottedName.assertFromString(moduleName)
          pkg.modules.get(modName).flatMap { module =>
            val dtName = Ref.DottedName.assertFromString(entityName)
            module.definitions.get(dtName).collect {
              case Ast.DDataType(_, _, Ast.DataRecord(fields)) =>
                fields.toSeq.map { case (name, typ) => (name.toString, typ) }
            }
          }
        }

        val argValue = fieldTypes match {
          case Some(ft) =>
            val entries: Seq[(Option[Ref.Name], Value)] = ft.map { case (name, typ) =>
              val raw = command.arguments.getOrElse(name, "")
              (Some(Ref.Name.assertFromString(name)): Option[Ref.Name], stringToTypedValue(raw, typ))
            }
            ValueRecord(None, ImmArray.from(entries))
          case None =>
            buildValueRecordTyped(command.arguments)
        }

        ApiCommand.Create(templateRef, argValue)
    }
  }

  /**
   * Resolve a type to its record fields if it refers to a data type definition.
   */
  private def resolveRecordFields(
    typ: Ast.Type,
    module: Ast.GenModule[Ast.Expr],
    pkg: Package
  ): Option[Seq[(String, Ast.Type)]] = {
    typ match {
      case Ast.TTyCon(typeConId) =>
        // Look up the data type in the same package
        val targetModule = pkg.modules.get(typeConId.qualifiedName.module)
        targetModule.flatMap { mod =>
          mod.definitions.get(typeConId.qualifiedName.name).collect {
            case Ast.DDataType(_, _, Ast.DataRecord(fields)) =>
              fields.toSeq.map { case (name, fieldType) => (name.toString, fieldType) }
          }
        }
      case Ast.TApp(base, _) => resolveRecordFields(base, module, pkg)
      case _ => None
    }
  }

  /**
   * Build a typed Value.ValueRecord from a flat string map.
   *
   * Each entry becomes a (Some(Name), ValueText) pair. This is a
   * simplified representation; proper typing would require the DALF schema.
   */
  private def buildValueRecordTyped(fields: Map[String, String]): Value = {
    val fieldEntries: Seq[(Option[Ref.Name], Value)] = fields.toSeq.map { case (k, v) =>
      val typedValue: Value = if (v.contains("::")) {
        // Party values contain "::" separator (e.g., "alice::1220abcd...")
        Value.ValueParty(Ref.Party.assertFromString(v))
      } else if (v == "true" || v == "false") {
        Value.ValueBool(v.toBoolean)
      } else if (v.matches("-?\\d+")) {
        Value.ValueInt64(v.toLong)
      } else if (v.matches("-?\\d+\\.\\d+")) {
        Value.ValueNumeric(com.digitalasset.daml.lf.data.Numeric.assertFromBigDecimal(
          com.digitalasset.daml.lf.data.Numeric.Scale.values(10),
          BigDecimal(v).bigDecimal
        ))
      } else {
        ValueText(v)
      }
      (Some(Ref.Name.assertFromString(k)): Option[Ref.Name], typedValue)
    }
    ValueRecord(None, ImmArray.from(fieldEntries))
  }

  /**
   * Build a ValueRecord from an ordered sequence of (name, value) pairs.
   */
  /**
   * Convert a string value to a typed Daml-LF Value using the field's type from the package AST.
   * This is the proper way to build values — using real type information, not heuristics.
   */
  private def stringToTypedValue(raw: String, fieldType: Ast.Type): Value = {
    // Unwrap TApp to get the base type constructor
    def unwrapType(t: Ast.Type): Ast.Type = t match {
      case Ast.TApp(base, _) => unwrapType(base)
      case other => other
    }

    unwrapType(fieldType) match {
      case Ast.TBuiltin(Ast.BTParty) =>
        Value.ValueParty(Ref.Party.assertFromString(raw))

      case Ast.TBuiltin(Ast.BTInt64) =>
        Value.ValueInt64(raw.toLong)

      case Ast.TBuiltin(Ast.BTNumeric) =>
        Value.ValueNumeric(com.digitalasset.daml.lf.data.Numeric.assertFromBigDecimal(
          com.digitalasset.daml.lf.data.Numeric.Scale.values(10),
          BigDecimal(raw).bigDecimal
        ))

      case Ast.TBuiltin(Ast.BTBool) =>
        Value.ValueBool(raw.toBoolean)

      case Ast.TBuiltin(Ast.BTDate) =>
        Value.ValueDate(com.digitalasset.daml.lf.data.Time.Date.assertFromString(raw))

      case Ast.TBuiltin(Ast.BTTimestamp) =>
        Value.ValueTimestamp(Time.Timestamp.assertFromInstant(Instant.parse(raw)))

      case Ast.TBuiltin(Ast.BTContractId) =>
        Value.ValueContractId(ContractId.assertFromString(raw))

      case Ast.TBuiltin(Ast.BTOptional) =>
        if (raw.isEmpty || raw == "null" || raw == "None") {
          Value.ValueOptional(None)
        } else {
          // For Optional, unwrap and convert the inner value
          val innerType = fieldType match {
            case Ast.TApp(_, inner) => inner
            case _ => Ast.TBuiltin(Ast.BTText)
          }
          Value.ValueOptional(Some(stringToTypedValue(raw, innerType)))
        }

      case Ast.TBuiltin(Ast.BTList) =>
        // Parse JSON array if the raw value looks like one
        if (raw.startsWith("[")) {
          try {
            val items = spray.json.JsonParser(raw).asInstanceOf[spray.json.JsArray].elements
            val innerType = fieldType match {
              case Ast.TApp(_, inner) => inner
              case _ => Ast.TBuiltin(Ast.BTText)
            }
            val values = items.map(item => stringToTypedValue(item.toString.stripPrefix("\"").stripSuffix("\""), innerType))
            Value.ValueList(com.digitalasset.daml.lf.data.FrontStack.from(values))
          } catch {
            case _: Exception => ValueText(raw)
          }
        } else {
          Value.ValueList(com.digitalasset.daml.lf.data.FrontStack.Empty)
        }

      case Ast.TBuiltin(Ast.BTText) =>
        ValueText(raw)

      case _ =>
        // Unknown type — use heuristic detection as last resort
        if (raw.contains("::")) Value.ValueParty(Ref.Party.assertFromString(raw))
        else ValueText(raw)
    }
  }

  /**
   * Build a ValueRecord from an ordered sequence of (name, value) pairs.
   * For contract instances, field labels must be None (positional) — the engine
   * rejects labeled records in contract values.
   */
  private def buildValueRecordTypedSeq(fields: Seq[(String, String)], labeled: Boolean = false): Value = {
    val fieldEntries: Seq[(Option[Ref.Name], Value)] = fields.map { case (k, v) =>
      val typedValue: Value = if (v.contains("::")) {
        Value.ValueParty(Ref.Party.assertFromString(v))
      } else if (v == "true" || v == "false") {
        Value.ValueBool(v.toBoolean)
      } else if (v.matches("-?\\d+") && !v.matches("-?\\d{10,}")) {
        Value.ValueInt64(v.toLong)
      } else if (v.matches("-?\\d+\\.\\d+")) {
        Value.ValueNumeric(com.digitalasset.daml.lf.data.Numeric.assertFromBigDecimal(
          com.digitalasset.daml.lf.data.Numeric.Scale.values(10),
          BigDecimal(v).bigDecimal
        ))
      } else {
        ValueText(v)
      }
      val label: Option[Ref.Name] = if (labeled) Some(Ref.Name.assertFromString(k)) else None
      (label, typedValue)
    }
    ValueRecord(None, ImmArray.from(fieldEntries))
  }

  /**
   * Build a FatContractInstance from our ContractInfo, for the consume()
   * contract lookup callback. We build a Node.Create and then use
   * FatContractInstance.fromCreateNode.
   */
  private def buildFatContractInstance(
    contract: ContractInfo,
    cid: ContractId,
    decodedPackages: mutable.Map[String, Package] = mutable.Map.empty
  ): FatContractInstance = {
    val parts = contract.templateId.split(":")
    require(parts.length >= 3,
      s"Contract templateId '${contract.templateId}' must be in Package:Module:Entity format")

    val pkgId = Ref.PackageId.assertFromString(parts(0))
    val qn = QualifiedName.assertFromString(s"${parts(1)}:${parts(2)}")
    val templateId: Ref.TypeConId = FullReference(pkgId, qn)

    // Look up the data type definition to get the correct field order AND types
    val fieldTypesOpt: Option[Seq[(String, Ast.Type)]] = decodedPackages.get(parts(0)).flatMap { pkg =>
      val moduleName = Ref.DottedName.assertFromString(parts(1))
      pkg.modules.get(moduleName).flatMap { module =>
        val dtName = Ref.DottedName.assertFromString(parts(2))
        module.definitions.get(dtName).collect {
          case Ast.DDataType(_, _, Ast.DataRecord(fields)) =>
            fields.toSeq.map { case (name, typ) => (name.toString, typ) }
        }
      }
    }

    // Build the record with fields in the correct order and proper types
    val createArg = fieldTypesOpt match {
      case Some(fieldTypes) =>
        // Use the package type info for proper type-aware value construction
        val fieldEntries: Seq[(Option[Ref.Name], Value)] = fieldTypes.map { case (fieldName, fieldType) =>
          val rawValue = contract.payload.getOrElse(fieldName, "")
          val typedValue = stringToTypedValue(rawValue, fieldType)
          (None: Option[Ref.Name], typedValue)
        }
        ValueRecord(None, ImmArray.from(fieldEntries))
      case None =>
        // No package info — fall back to heuristic type detection
        buildValueRecordTyped(contract.payload)
    }
    val signatories: Set[Ref.Party] = contract.signatories.map(Ref.Party.assertFromString)
    val stakeholders: Set[Ref.Party] = (contract.signatories ++ contract.observers).map(
      Ref.Party.assertFromString
    )

    // Get the actual package name from the decoded package metadata
    val packageName = decodedPackages.get(parts(0)).map { pkg =>
      pkg.metadata.name
    }.getOrElse(Ref.PackageName.assertFromString(parts(1).split("\\.").headOption.getOrElse("unknown")))

    val createNode = Node.Create(
      coid = cid,
      packageName = packageName,
      templateId = templateId,
      arg = createArg,
      signatories = signatories,
      stakeholders = stakeholders,
      keyOpt = None,
      version = SerializationVersion.V1
    )

    // Use a proper creation timestamp (not CreationTime.Now which is
    // disallowed for existing contracts)
    val creationTime = CreationTime.CreatedAt(
      Time.Timestamp.assertFromInstant(Instant.now().minusSeconds(3600))
    )
    FatContractInstance.fromCreateNode(
      createNode,
      creationTime,
      com.digitalasset.daml.lf.data.Bytes.Empty
    )
  }

  /**
   * Convert a VersionedTransaction from engine output to our TransactionTree model.
   */
  private def convertVersionedTransaction(
    vtx: VersionedTransaction,
    command: CommandRequest,
    decodedPackages: mutable.Map[String, Package] = mutable.Map.empty
  ): TransactionTree = {
    val txId = s"tx-${java.util.UUID.randomUUID().toString.take(8)}"
    val now = Instant.now().toString
    val events = mutable.Map[String, TransactionEvent]()
    val rootIds = mutable.ArrayBuffer[String]()

    try {
      val tx = vtx.transaction
      val roots = tx.roots
      val nodes = tx.nodes

      // Assign event IDs to all node IDs first
      val nodeIdToEventId = mutable.Map[com.digitalasset.daml.lf.transaction.NodeId, String]()
      var idx = 0
      nodes.keys.foreach { nodeId =>
        nodeIdToEventId(nodeId) = s"#$txId:$idx"
        idx += 1
      }

      // Convert all nodes
      nodes.foreach { case (nodeId, node) =>
        val eventId = nodeIdToEventId(nodeId)

        node match {
          case create: Node.Create =>
            events(eventId) = CreatedTransactionEvent(
              eventId = eventId,
              contractId = create.coid.coid,
              templateId = formatTypeConId(create.templateId),
              payload = extractRecordFieldsWithNames(create.arg, create.templateId, decodedPackages),
              signatories = create.signatories.map(identity[String]),
              observers = (create.stakeholders -- create.signatories).map(identity[String])
            )

          case exercise: Node.Exercise =>
            val childIds = exercise.children.toSeq.map { childNodeId =>
              nodeIdToEventId.getOrElse(childNodeId, s"#$txId:unknown")
            }
            events(eventId) = ExercisedTransactionEvent(
              eventId = eventId,
              contractId = exercise.targetCoid.coid,
              templateId = formatTypeConId(exercise.templateId),
              choice = exercise.choiceId,
              choiceArgument = extractRecordFieldsWithChoiceNames(exercise.chosenValue, exercise.templateId, exercise.choiceId, decodedPackages),
              actingParties = exercise.actingParties.map(identity[String]),
              consuming = exercise.consuming,
              childEventIds = childIds,
              exerciseResult = exercise.exerciseResult.map(valueToString)
            )

          case _ => // Skip non-action nodes (Fetch, LookupByKey, etc.)
        }
      }

      // Root event IDs
      roots.foreach { nodeId =>
        nodeIdToEventId.get(nodeId).foreach(rootIds += _)
      }
    } catch {
      case ex: Exception =>
        logger.error(s"Error converting engine transaction nodes: ${ex.getMessage}", ex)
    }

    TransactionTree(
      updateId = txId,
      commandId = Some(s"cmd-${txId.takeRight(8)}"),
      workflowId = None,
      offset = None,
      effectiveAt = Some(now),
      rootEventIds = rootIds.toSeq,
      eventsById = events.toMap
    )
  }

  /** Format a TypeConId as "packageId:module:entity" for the JSON model. */
  private def formatTypeConId(id: Ref.TypeConId): String = {
    s"${id.packageId}:${id.qualifiedName.module}:${id.qualifiedName.name}"
  }

  /**
   * Extract field names and string values from a Daml-LF Value, for display
   * in our string-based model. Complex nested values are rendered via toString.
   */
  /**
   * Extract record fields with proper names from the package type definitions.
   * For template data types (Create nodes), the field names come from the DataRecord.
   */
  private def extractRecordFieldsWithNames(value: Value, templateId: Ref.TypeConId, pkgs: mutable.Map[String, Package] = mutable.Map.empty): Map[String, String] = {
    val fieldNames = pkgs.get(templateId.packageId).flatMap { pkg =>
      val moduleName = templateId.qualifiedName.module
      val dtName = templateId.qualifiedName.name
      pkg.modules.get(moduleName).flatMap { module =>
        module.definitions.get(dtName).collect {
          case Ast.DDataType(_, _, Ast.DataRecord(fields)) =>
            fields.toSeq.map(_._1.toString)
        }
      }
    }
    extractRecordFieldsOrdered(value, fieldNames)
  }

  /**
   * Extract choice argument fields with proper names.
   * Choice arg type is resolved from the template's choice definition.
   */
  private def extractRecordFieldsWithChoiceNames(
    value: Value, templateId: Ref.TypeConId, choiceId: String, pkgs: mutable.Map[String, Package] = mutable.Map.empty
  ): Map[String, String] = {
    val fieldNames = pkgs.get(templateId.packageId).flatMap { pkg =>
      val moduleName = templateId.qualifiedName.module
      val tmplName = templateId.qualifiedName.name
      pkg.modules.get(moduleName).flatMap { module =>
        module.templates.get(tmplName).flatMap { tmpl =>
          val cn = Ref.ChoiceName.assertFromString(choiceId)
          tmpl.choices.get(cn).flatMap { choice =>
            resolveRecordFields(choice.argBinder._2, module, pkg).map(
              _.map(_._1)
            )
          }
        }
      }
    }
    extractRecordFieldsOrdered(value, fieldNames)
  }

  /** Extract fields from a Value, using provided names for positional fields. */
  private def extractRecordFieldsOrdered(value: Value, fieldNames: Option[Seq[String]]): Map[String, String] = {
    value match {
      case ValueRecord(_, fields) =>
        val names = fieldNames.getOrElse(Seq.empty)
        fields.toSeq.zipWithIndex.flatMap {
          case ((Some(name), v), _) => Some(name.toString -> valueToString(v))
          case ((None, v), idx) =>
            val name = if (idx < names.length) names(idx) else s"field_$idx"
            Some(name -> valueToString(v))
        }.toMap
      case _ =>
        Map("value" -> valueToString(value))
    }
  }

  private def extractRecordFields(value: Value): Map[String, String] = {
    value match {
      case ValueRecord(_, fields) =>
        fields.toSeq.zipWithIndex.flatMap {
          case ((Some(name), v), _) => Some(name.toString -> valueToString(v))
          case ((None, v), idx) => Some(s"field_$idx" -> valueToString(v))
        }.toMap
      case _ =>
        Map("value" -> value.toString)
    }
  }

  /** Render a Daml-LF Value as a human-readable string. */
  private def valueToString(v: Value): String = v match {
    case ValueText(s) => s
    case Value.ValueInt64(n) => n.toString
    case Value.ValueBool(b) => b.toString
    case Value.ValueParty(p) => p
    case Value.ValueContractId(cid) => cid.coid
    case Value.ValueUnit => "()"
    case Value.ValueOptional(None) => "None"
    case Value.ValueOptional(Some(inner)) => s"Some(${valueToString(inner)})"
    case ValueRecord(_, fields) =>
      fields.toSeq.map {
        case (Some(n), fv) => s"$n = ${valueToString(fv)}"
        case (None, fv) => valueToString(fv)
      }.mkString("{", ", ", "}")
    case Value.ValueList(elems) =>
      elems.toImmArray.toSeq.map(valueToString).mkString("[", ", ", "]")
    case other => other.toString
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  // NOTE: All synthetic/fallback tracing code has been removed.
  // The engine uses the real Daml-LF Engine exclusively.
  // If the engine fails, it fails with a real error.

  private def buildTrace(
    steps: Seq[TraceStep],
    sourceFiles: Map[String, String],
    sourceAvailable: Boolean,
    resultTransaction: Option[TransactionTree],
    error: Option[String],
    startTimeNanos: Long
  ): ExecutionTrace = {
    val durationMs = (System.nanoTime() - startTimeNanos) / 1000000
    logger.info(s"Trace completed in ${durationMs}ms with ${steps.size} steps, error=${error.isDefined}")
    ExecutionTrace(
      steps = steps,
      sourceFiles = sourceFiles,
      sourceAvailable = sourceAvailable,
      resultTransaction = resultTransaction,
      error = error,
      profilerData = None
    )
  }
}
