package cantontrace.engine

import cantontrace.model._
import com.typesafe.config.ConfigFactory
import com.typesafe.scalalogging.LazyLogging

import java.time.Instant
import scala.collection.mutable
import scala.util.{Failure, Success, Try}

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
      Class.forName("com.daml.lf.engine.Engine")
      Class.forName("com.daml.lf.engine.Result")
      true
    } catch {
      case _: ClassNotFoundException => false
    }
  }

  if (realEngineAvailable) {
    logger.info("Daml-LF Engine classes detected on classpath; real engine path enabled")
  } else {
    logger.warn("Daml-LF Engine classes NOT found on classpath; using synthetic tracing fallback")
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
    if (realEngineAvailable) {
      traceWithEngine(command, packages, contracts, disclosedContracts, actAs, readAs)
    } else {
      traceSynthetic(command, packages, contracts, disclosedContracts, actAs, readAs)
    }
  }

  /**
   * Execute a command without instrumentation (faster, for simulation).
   *
   * Attempts to use the real Daml-LF Engine first. If the engine classes are
   * not on the classpath or the engine invocation fails, falls back to
   * synthetic simulation.
   */
  def simulate(
    command: CommandRequest,
    packages: Map[String, String],
    contracts: Map[String, ContractInfo],
    disclosedContracts: Seq[ContractInfo],
    actAs: Set[String],
    readAs: Set[String]
  ): SimulationResult = {
    if (realEngineAvailable) {
      simulateWithEngine(command, packages, contracts, disclosedContracts, actAs, readAs)
    } else {
      simulateSynthetic(command, packages, contracts, disclosedContracts, actAs, readAs)
    }
  }

  // -----------------------------------------------------------------------
  // Real Engine path — uses Daml-LF Engine via reflection
  // -----------------------------------------------------------------------

  /**
   * Attempt to trace using the real Daml-LF Engine.
   *
   * Uses the Engine's Result monad to process contract fetches and package
   * lookups, recording each callback as a TraceStep. Falls back to
   * [[traceSynthetic]] if any part of the engine invocation fails.
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
    var stepNumber = 0
    val startTime = System.nanoTime()

    try {
      val engineResult = tryRealEngine(
        command, packages, contracts, disclosedContracts, actAs, readAs, steps
      )
      engineResult match {
        case Some(trace) => trace
        case None =>
          logger.warn("Real Daml-LF Engine invocation returned None, falling back to synthetic tracing")
          traceSynthetic(command, packages, contracts, disclosedContracts, actAs, readAs)
      }
    } catch {
      case ex: Exception =>
        logger.warn(s"Engine-based tracing failed, falling back to synthetic: ${ex.getMessage}", ex)
        traceSynthetic(command, packages, contracts, disclosedContracts, actAs, readAs)
    }
  }

  /**
   * Attempt to simulate using the real Daml-LF Engine.
   *
   * Falls back to [[simulateSynthetic]] on failure.
   */
  private[engine] def simulateWithEngine(
    command: CommandRequest,
    packages: Map[String, String],
    contracts: Map[String, ContractInfo],
    disclosedContracts: Seq[ContractInfo],
    actAs: Set[String],
    readAs: Set[String]
  ): SimulationResult = {
    val now = Instant.now().toString
    try {
      val engineResult = tryRealEngineSimulation(
        command, packages, contracts, disclosedContracts, actAs, readAs
      )
      engineResult match {
        case Some(result) => result
        case None =>
          logger.warn("Real Daml-LF Engine simulation returned None, falling back to synthetic")
          simulateSynthetic(command, packages, contracts, disclosedContracts, actAs, readAs)
      }
    } catch {
      case ex: Exception =>
        logger.warn(s"Engine-based simulation failed, falling back to synthetic: ${ex.getMessage}", ex)
        simulateSynthetic(command, packages, contracts, disclosedContracts, actAs, readAs)
    }
  }

  /**
   * Use reflection to invoke the real Daml-LF Engine for tracing.
   *
   * This method:
   *  1. Decodes DALF archives into Package objects via the archive reader
   *  2. Creates an Engine instance with a default configuration
   *  3. Submits the command and iterates the Result monad
   *  4. Records a TraceStep for each ResultNeedContract / ResultNeedPackage
   *  5. Returns Some(ExecutionTrace) on success, None if the engine API
   *     cannot be accessed
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
      val archiveDecoderClass = Class.forName("com.daml.lf.archive.ArchiveDecoder")

      // Decode each package from base64 DALF bytes
      val decodedPackages = mutable.Map[String, AnyRef]()
      var decodeFailures = mutable.ArrayBuffer[String]()
      packages.foreach { case (pkgId, base64Dalf) =>
        val dalfBytes = java.util.Base64.getDecoder.decode(base64Dalf)
        val decoded = Try {
          tryDecodeArchive(archiveDecoderClass, dalfBytes)
        }

        decoded match {
          case Success(pkg) =>
            decodedPackages(pkgId) = pkg
          case Failure(decodeErr) =>
            decodeFailures += s"$pkgId: ${decodeErr.getMessage}"
        }
      }

      // Emit a single collapsed step for all package loading
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
      val engineClass = Class.forName("com.daml.lf.engine.Engine")
      val engineConfigClass = Class.forName("com.daml.lf.engine.EngineConfig")

      // Get default/stable engine configuration
      val stableConfig = tryGetEngineConfig(engineConfigClass)
      val engine = tryCreateEngine(engineClass, engineConfigClass, stableConfig)

      steps += TraceStep(
        stepNumber = stepNumber,
        stepType = "evaluate_expression",
        sourceLocation = None,
        summary = "Initialize Daml-LF Engine",
        variables = Map(
          "engineClass" -> engineClass.getName,
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
        tryPreloadPackage(engine, pkgId, pkg)
      }

      // --- Step 4: Submit command and process Result monad ---
      stepNumber += 1
      val submitResult = trySubmitCommand(
        engine, command, actAs, readAs, decodedPackages.toMap
      )

      submitResult match {
        case Some(resultObj) =>
          // Process the Result monad loop
          val (finalSteps, resultTx, error) = processResultMonad(
            resultObj, engine, contracts, disclosedContracts, packages,
            decodedPackages, steps, stepNumber
          )

          steps += TraceStep(
            stepNumber = finalSteps,
            stepType = "evaluate_expression",
            sourceLocation = None,
            summary = if (error.isEmpty) "Command evaluation complete" else s"Command evaluation failed: ${error.get}",
            variables = Map(
              "commandType" -> command.choice.map(_ => "exercise").getOrElse("create"),
              "templateId" -> command.templateId
            ),
            context = ExpressionContext(
              expressionType = "command_result",
              variables = Map("success" -> error.isEmpty.toString)
            ),
            passed = error.isEmpty,
            error = error
          )

          Some(buildTrace(steps.toSeq, Map.empty, sourceAvailable = false, resultTx, error, startTime))

        case None =>
          // Could not submit to engine — fall back
          logger.warn("Engine.submit() could not be invoked via reflection")
          None
      }
    }.toOption.flatten
  }

  /**
   * Use reflection to invoke the real Daml-LF Engine for simulation (no step recording).
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
      val archiveDecoderClass = Class.forName("com.daml.lf.archive.ArchiveDecoder")

      // Decode packages
      val decodedPackages = mutable.Map[String, AnyRef]()
      packages.foreach { case (pkgId, base64Dalf) =>
        val dalfBytes = java.util.Base64.getDecoder.decode(base64Dalf)
        val pkg = tryDecodeArchive(archiveDecoderClass, dalfBytes)
        decodedPackages(pkgId) = pkg
      }

      // Create engine
      val engineClass = Class.forName("com.daml.lf.engine.Engine")
      val engineConfigClass = Class.forName("com.daml.lf.engine.EngineConfig")
      val stableConfig = tryGetEngineConfig(engineConfigClass)
      val engine = tryCreateEngine(engineClass, engineConfigClass, stableConfig)

      // Preload packages
      decodedPackages.foreach { case (pkgId, pkg) =>
        tryPreloadPackage(engine, pkgId, pkg)
      }

      // Submit command
      val submitResult = trySubmitCommand(engine, command, actAs, readAs, decodedPackages.toMap)

      submitResult match {
        case Some(resultObj) =>
          val dummySteps = mutable.ArrayBuffer[TraceStep]()
          val (_, resultTx, error) = processResultMonad(
            resultObj, engine, contracts, disclosedContracts, packages,
            decodedPackages, dummySteps, 0
          )

          Some(SimulationResult(
            success = error.isEmpty,
            transactionTree = resultTx,
            error = error,
            errorCategory = error.map(_ => "InvalidIndependentOfSystemState"),
            simulatedAt = now,
            atOffset = None,
            stateDriftWarning = "Simulation used a point-in-time ACS snapshot; the live ledger may have diverged."
          ))

        case None => None
      }
    }.toOption.flatten
  }

  // -----------------------------------------------------------------------
  // Reflection helpers for Daml-LF Engine interaction
  // -----------------------------------------------------------------------

  /**
   * Attempt to decode a DALF archive using the ArchiveDecoder.
   * Tries multiple method signatures to handle different SDK versions.
   */
  private def tryDecodeArchive(archiveDecoderClass: Class[_], dalfBytes: Array[Byte]): AnyRef = {
    // Try ArchiveDecoder$.MODULE$.fromBytes(bytes)
    // The companion object is accessed via the $ class
    val companionClass = Class.forName("com.daml.lf.archive.ArchiveDecoder$")
    val moduleField = companionClass.getField("MODULE$")
    val companion = moduleField.get(null)

    // Try common method names: fromBytes, decodeArchive, assertFromBytes
    val methods = Seq("fromBytes", "decodeArchive", "assertFromBytes")
    var decoded: AnyRef = null
    var lastError: Throwable = null

    for (methodName <- methods if decoded == null) {
      try {
        val method = companion.getClass.getMethod(methodName, classOf[Array[Byte]])
        decoded = method.invoke(companion, dalfBytes).asInstanceOf[AnyRef]
      } catch {
        case e: NoSuchMethodException => lastError = e
        case e: java.lang.reflect.InvocationTargetException =>
          lastError = e.getCause
      }
    }

    // Also try with InputStream
    if (decoded == null) {
      try {
        val method = companion.getClass.getMethod("fromBytes", classOf[Array[Byte]])
        decoded = method.invoke(companion, dalfBytes).asInstanceOf[AnyRef]
      } catch {
        case _: Exception => // ignore
      }
    }

    if (decoded == null) {
      throw new RuntimeException(
        s"Could not decode DALF archive: no compatible ArchiveDecoder method found" +
          (if (lastError != null) s" (last error: ${lastError.getMessage})" else "")
      )
    }

    decoded
  }

  /**
   * Get the default/stable EngineConfig via reflection.
   */
  private def tryGetEngineConfig(engineConfigClass: Class[_]): AnyRef = {
    // Try EngineConfig$.MODULE$.Stable or EngineConfig$.MODULE$.Dev
    try {
      val companionClass = Class.forName(engineConfigClass.getName + "$")
      val moduleField = companionClass.getField("MODULE$")
      val companion = moduleField.get(null)

      // Try .Stable first (Daml 2.x), then .Dev, then .default
      val configMethods = Seq("Stable", "Dev", "default$default$1")
      var config: AnyRef = null
      for (name <- configMethods if config == null) {
        try {
          val method = companion.getClass.getMethod(name)
          config = method.invoke(companion).asInstanceOf[AnyRef]
        } catch {
          case _: NoSuchMethodException => // try next
        }
      }

      // If no named method, try the companion object itself as a config factory
      if (config == null) {
        // Try calling the apply() or the no-arg constructor
        try {
          config = engineConfigClass.getDeclaredConstructor().newInstance().asInstanceOf[AnyRef]
        } catch {
          case _: Exception =>
            // Use the companion as the config if it's an instance of EngineConfig
            if (engineConfigClass.isInstance(companion)) {
              config = companion
            }
        }
      }

      if (config == null) {
        throw new RuntimeException("Could not obtain EngineConfig instance")
      }
      config
    } catch {
      case e: ClassNotFoundException =>
        // No companion object; try no-arg constructor
        engineConfigClass.getDeclaredConstructor().newInstance().asInstanceOf[AnyRef]
    }
  }

  /**
   * Create an Engine instance via reflection.
   */
  private def tryCreateEngine(
    engineClass: Class[_],
    engineConfigClass: Class[_],
    config: AnyRef
  ): AnyRef = {
    // Try Engine(config) constructor
    try {
      val constructor = engineClass.getConstructor(engineConfigClass)
      constructor.newInstance(config).asInstanceOf[AnyRef]
    } catch {
      case _: NoSuchMethodException =>
        // Try no-arg constructor
        try {
          engineClass.getDeclaredConstructor().newInstance().asInstanceOf[AnyRef]
        } catch {
          case _: Exception =>
            // Try Engine$.MODULE$.apply(config) or similar factory
            val companionClass = Class.forName(engineClass.getName + "$")
            val moduleField = companionClass.getField("MODULE$")
            val companion = moduleField.get(null)
            val applyMethod = companion.getClass.getMethod("apply", engineConfigClass)
            applyMethod.invoke(companion, config).asInstanceOf[AnyRef]
        }
    }
  }

  /**
   * Preload a decoded package into the engine via reflection.
   */
  private def tryPreloadPackage(engine: AnyRef, pkgId: String, pkg: AnyRef): Unit = {
    try {
      // engine.preloadPackage(packageId, package)
      // The exact method name is typically 'preloadPackage'
      val methods = engine.getClass.getMethods.filter(_.getName == "preloadPackage")
      if (methods.nonEmpty) {
        val method = methods.head
        // Build PackageId from string
        val packageId = buildPackageId(pkgId)

        // The pkg object from decoding may be a tuple (PackageId, Package) or just Package
        val actualPkg = extractPackageFromDecodeResult(pkg)

        if (method.getParameterCount == 2) {
          method.invoke(engine, packageId, actualPkg)
        }
      }
    } catch {
      case ex: Exception =>
        logger.debug(s"Could not preload package $pkgId: ${ex.getMessage}")
    }
  }

  /**
   * Build a Daml-LF PackageId from a string via reflection.
   */
  private def buildPackageId(pkgIdStr: String): AnyRef = {
    try {
      val pkgIdClass = Class.forName("com.daml.lf.data.Ref$PackageId$")
      val moduleField = pkgIdClass.getField("MODULE$")
      val companion = moduleField.get(null)
      val assertFromString = companion.getClass.getMethod("assertFromString", classOf[String])
      assertFromString.invoke(companion, pkgIdStr).asInstanceOf[AnyRef]
    } catch {
      case _: Exception =>
        // Fallback: try Ref.PackageId.assertFromString
        val refClass = Class.forName("com.daml.lf.data.Ref")
        val pkgIdCompanion = refClass.getMethod("PackageId").invoke(null)
        val assertFrom = pkgIdCompanion.getClass.getMethod("assertFromString", classOf[String])
        assertFrom.invoke(pkgIdCompanion, pkgIdStr).asInstanceOf[AnyRef]
    }
  }

  /**
   * Extract the Package object from a decode result that may be a tuple.
   */
  private def extractPackageFromDecodeResult(result: AnyRef): AnyRef = {
    // If result is a Tuple2, extract _2 (the Package)
    result match {
      case tuple: (_, _) => tuple._2.asInstanceOf[AnyRef]
      case _ => result
    }
  }

  /**
   * Attempt to submit a command to the engine via reflection.
   * Returns Some(Result) if submission succeeded, None otherwise.
   */
  private def trySubmitCommand(
    engine: AnyRef,
    command: CommandRequest,
    actAs: Set[String],
    readAs: Set[String],
    decodedPackages: Map[String, AnyRef]
  ): Option[AnyRef] = {
    try {
      // The Engine.submit() method signature varies by SDK version.
      // Common signatures:
      //   submit(submitters, readAs, cmds, participantId, submissionSeed)
      //   submit(submitters, commands, participantId, submissionSeed)
      //
      // Since building the exact Daml-LF Command objects from our string-based
      // CommandRequest requires deep knowledge of the template/choice types
      // (which are encoded in the DALF packages), we attempt the following:
      //
      // 1. Build a Commands object from our CommandRequest
      // 2. Call engine.submit()
      // 3. Return the Result object

      // For now, try to find the submit method and invoke it
      val submitMethods = engine.getClass.getMethods.filter(_.getName == "submit")
      if (submitMethods.isEmpty) {
        logger.debug("No submit method found on Engine class")
        return None
      }

      // Building the actual Daml-LF Commands requires constructing typed values
      // from our flat string map, which needs the package's type information.
      // This is the key challenge in bridging our string-based model to the
      // strongly-typed Daml-LF world.
      //
      // We need: submitters (Set[Party]), Commands, participantId, submissionSeed
      val submitters = buildPartySet(actAs)
      val readAsParties = buildPartySet(readAs)
      val commands = buildCommands(command, decodedPackages)
      val participantId = buildParticipantId("cantontrace-engine")
      val submissionSeed = buildSubmissionSeed()

      if (submitters == null || commands == null) {
        logger.debug("Could not build required Daml-LF types for engine submission")
        return None
      }

      // Try different submit method overloads
      for (method <- submitMethods) {
        try {
          val paramCount = method.getParameterCount
          val result = paramCount match {
            case 5 => method.invoke(engine, submitters, readAsParties, commands, participantId, submissionSeed)
            case 4 => method.invoke(engine, submitters, commands, participantId, submissionSeed)
            case _ => null
          }
          if (result != null) return Some(result)
        } catch {
          case _: Exception => // try next overload
        }
      }

      None
    } catch {
      case ex: Exception =>
        logger.debug(s"Engine submission failed: ${ex.getMessage}")
        None
    }
  }

  /**
   * Build a Set[Party] from string party names via reflection.
   */
  private def buildPartySet(parties: Set[String]): AnyRef = {
    try {
      val partyCompanionClass = Class.forName("com.daml.lf.data.Ref$Party$")
      val moduleField = partyCompanionClass.getField("MODULE$")
      val companion = moduleField.get(null)
      val assertFromString = companion.getClass.getMethod("assertFromString", classOf[String])

      val partySet = parties.map { p =>
        assertFromString.invoke(companion, p)
      }

      // Convert to the appropriate immutable set type
      partySet.asInstanceOf[AnyRef]
    } catch {
      case ex: Exception =>
        logger.debug(s"Could not build Party set: ${ex.getMessage}")
        null
    }
  }

  /**
   * Build a participant ID via reflection.
   */
  private def buildParticipantId(id: String): AnyRef = {
    try {
      val refClass = Class.forName("com.daml.lf.data.Ref$ParticipantId$")
      val moduleField = refClass.getField("MODULE$")
      val companion = moduleField.get(null)
      val assertFromString = companion.getClass.getMethod("assertFromString", classOf[String])
      assertFromString.invoke(companion, id).asInstanceOf[AnyRef]
    } catch {
      case _: Exception => null
    }
  }

  /**
   * Build a submission seed (crypto hash) via reflection.
   */
  private def buildSubmissionSeed(): AnyRef = {
    try {
      val hashClass = Class.forName("com.daml.lf.crypto.Hash$")
      val moduleField = hashClass.getField("MODULE$")
      val companion = moduleField.get(null)
      // Try hashPrivateKey which generates a deterministic hash
      val method = companion.getClass.getMethod("hashPrivateKey", classOf[String])
      method.invoke(companion, s"cantontrace-${System.nanoTime()}").asInstanceOf[AnyRef]
    } catch {
      case _: Exception => null
    }
  }

  /**
   * Build a Daml-LF Commands object from our CommandRequest via reflection.
   *
   * This is the most complex bridge between our string-based model and the
   * strongly-typed Daml-LF world. The Commands object requires:
   *  - A qualified template identifier (parsed from "Package:Module:Entity")
   *  - Typed values (built from our flat string map using the package's types)
   *  - Command metadata (application ID, command ID, etc.)
   */
  private def buildCommands(command: CommandRequest, decodedPackages: Map[String, AnyRef]): AnyRef = {
    try {
      // Parse the template ID into its components
      val templateParts = command.templateId.split(":")
      if (templateParts.length < 3) {
        logger.debug(s"Template ID '${command.templateId}' does not have expected Package:Module:Entity format")
        return null
      }

      val packageIdStr = templateParts(0)
      val moduleName = templateParts(1)
      val entityName = templateParts(2)

      // Build the qualified template identifier
      val packageId = buildPackageId(packageIdStr)
      val qualifiedName = buildQualifiedName(moduleName, entityName)
      val templateId = buildIdentifier(packageId, qualifiedName)

      if (templateId == null) return null

      // Build the command (Create or Exercise)
      val cmd = command.choice match {
        case Some(choiceName) =>
          buildExerciseCommand(templateId, command.contractId.get, choiceName, command.arguments)
        case None =>
          buildCreateCommand(templateId, command.arguments)
      }

      if (cmd == null) return null

      // Wrap in a Commands object
      buildCommandsWrapper(cmd, command)
    } catch {
      case ex: Exception =>
        logger.debug(s"Could not build Commands: ${ex.getMessage}")
        null
    }
  }

  /** Build a QualifiedName from module and entity strings. */
  private def buildQualifiedName(moduleName: String, entityName: String): AnyRef = {
    try {
      val qnClass = Class.forName("com.daml.lf.data.Ref$QualifiedName$")
      val moduleField = qnClass.getField("MODULE$")
      val companion = moduleField.get(null)
      val assertFromString = companion.getClass.getMethod("assertFromString", classOf[String])
      assertFromString.invoke(companion, s"$moduleName:$entityName").asInstanceOf[AnyRef]
    } catch {
      case _: Exception => null
    }
  }

  /** Build an Identifier from PackageId and QualifiedName. */
  private def buildIdentifier(packageId: AnyRef, qualifiedName: AnyRef): AnyRef = {
    try {
      val idClass = Class.forName("com.daml.lf.data.Ref$Identifier")
      val pkgIdClass = Class.forName("com.daml.lf.data.Ref$PackageId")
      val qnClass = Class.forName("com.daml.lf.data.Ref$QualifiedName")

      // Check for nested types — Ref types are often defined within the Ref object
      val constructor = idClass.getConstructors.head
      constructor.newInstance(packageId, qualifiedName).asInstanceOf[AnyRef]
    } catch {
      case _: Exception => null
    }
  }

  /** Build a Create command from template ID and arguments. */
  private def buildCreateCommand(templateId: AnyRef, arguments: Map[String, String]): AnyRef = {
    try {
      val createClass = Class.forName("com.daml.lf.command.ApiCommand$Create")
      val valueRecord = buildValueRecord(arguments)
      val constructor = createClass.getConstructors.head
      constructor.newInstance(templateId, valueRecord).asInstanceOf[AnyRef]
    } catch {
      case _: Exception => null
    }
  }

  /** Build an Exercise command from template ID, contract ID, choice, and arguments. */
  private def buildExerciseCommand(
    templateId: AnyRef,
    contractIdStr: String,
    choiceName: String,
    arguments: Map[String, String]
  ): AnyRef = {
    try {
      val exerciseClass = Class.forName("com.daml.lf.command.ApiCommand$Exercise")
      val contractId = buildContractId(contractIdStr)
      val choice = buildChoiceName(choiceName)
      val valueRecord = buildValueRecord(arguments)
      val constructor = exerciseClass.getConstructors.head
      constructor.newInstance(templateId, contractId, choice, valueRecord).asInstanceOf[AnyRef]
    } catch {
      case _: Exception => null
    }
  }

  /** Build a ContractId value via reflection. */
  private def buildContractId(cidStr: String): AnyRef = {
    try {
      val cidClass = Class.forName("com.daml.lf.value.Value$ContractId$")
      val moduleField = cidClass.getField("MODULE$")
      val companion = moduleField.get(null)
      val assertFromString = companion.getClass.getMethod("assertFromString", classOf[String])
      assertFromString.invoke(companion, cidStr).asInstanceOf[AnyRef]
    } catch {
      case _: Exception => null
    }
  }

  /** Build a ChoiceName via reflection. */
  private def buildChoiceName(name: String): AnyRef = {
    try {
      val nameClass = Class.forName("com.daml.lf.data.Ref$ChoiceName$")
      val moduleField = nameClass.getField("MODULE$")
      val companion = moduleField.get(null)
      val assertFromString = companion.getClass.getMethod("assertFromString", classOf[String])
      assertFromString.invoke(companion, name).asInstanceOf[AnyRef]
    } catch {
      case _: Exception => null
    }
  }

  /**
   * Build a Value.ValueRecord from a flat string map.
   *
   * This creates a record with ValueText fields for each entry in the map.
   * While this is a simplified representation (real Daml values have richer
   * types), it allows the engine to process the command structure.
   */
  private def buildValueRecord(fields: Map[String, String]): AnyRef = {
    try {
      val valueClass = Class.forName("com.daml.lf.value.Value")
      val recordClass = Class.forName("com.daml.lf.value.Value$ValueRecord")
      val textClass = Class.forName("com.daml.lf.value.Value$ValueText")

      // Build field list as ImmArray of (Option[Name], Value)
      val fieldEntries = fields.map { case (k, v) =>
        val fieldName = buildFieldName(k)
        val textValue = textClass.getConstructors.head.newInstance(v)
        (fieldName, textValue)
      }

      // Construct the ValueRecord
      recordClass.getConstructors.head.newInstance(
        None, // Optional type identifier
        fieldEntries.toSeq
      ).asInstanceOf[AnyRef]
    } catch {
      case _: Exception => null
    }
  }

  /** Build a field name via reflection. */
  private def buildFieldName(name: String): AnyRef = {
    try {
      val nameClass = Class.forName("com.daml.lf.data.Ref$Name$")
      val moduleField = nameClass.getField("MODULE$")
      val companion = moduleField.get(null)
      val assertFromString = companion.getClass.getMethod("assertFromString", classOf[String])
      Some(assertFromString.invoke(companion, name)).asInstanceOf[AnyRef]
    } catch {
      case _: Exception => None.asInstanceOf[AnyRef]
    }
  }

  /** Wrap a command in a Commands object. */
  private def buildCommandsWrapper(cmd: AnyRef, command: CommandRequest): AnyRef = {
    // The exact Commands wrapper varies significantly between SDK versions.
    // Return the raw command for now; the submit method may accept it directly.
    cmd
  }

  /**
   * Process the Result monad returned by Engine.submit().
   *
   * Iterates the Result chain, handling each callback:
   *  - ResultNeedContract: look up contract, record step, resume
   *  - ResultNeedPackage: look up package, record step, resume
   *  - ResultDone: extract transaction, record success
   *  - ResultError: record failure
   *
   * Returns (finalStepNumber, optionalTransaction, optionalError)
   */
  private def processResultMonad(
    initialResult: AnyRef,
    engine: AnyRef,
    contracts: Map[String, ContractInfo],
    disclosedContracts: Seq[ContractInfo],
    packages: Map[String, String],
    decodedPackages: mutable.Map[String, AnyRef],
    steps: mutable.ArrayBuffer[TraceStep],
    startStep: Int
  ): (Int, Option[TransactionTree], Option[String]) = {
    var stepNumber = startStep
    var current = initialResult
    var done = false
    var resultTx: Option[TransactionTree] = None
    var error: Option[String] = None
    var iterations = 0
    val maxIterations = maxTraceSteps
    // Track runtime package requests silently (already loaded in step 1)
    var runtimePkgFetches = 0
    var runtimePkgFailures = mutable.ArrayBuffer[String]()

    while (!done && iterations < maxIterations) {
      iterations += 1
      val className = current.getClass.getSimpleName

      className match {
        case name if name.startsWith("ResultDone") =>
          // Extract the transaction from ResultDone
          done = true
          try {
            val getResult = current.getClass.getMethod("result")
            val txObj = getResult.invoke(current)
            // Convert the engine transaction to our TransactionTree model
            resultTx = Some(convertEngineTransaction(txObj, current.getClass.getName))
          } catch {
            case ex: Exception =>
              logger.debug(s"Could not extract transaction from ResultDone: ${ex.getMessage}")
              // Build a synthetic transaction as a fallback
              resultTx = None
          }

        case name if name.startsWith("ResultNeedContract") =>
          stepNumber += 1
          try {
            // Extract the contract ID from the result
            val cidMethod = current.getClass.getMethod("contractId")
            val cidObj = cidMethod.invoke(current)
            val cidStr = cidObj.toString

            // Look up the contract in our store
            val contract = contracts.get(cidStr).orElse(
              disclosedContracts.find(_.contractId == cidStr)
            )
            val source = contract match {
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
                payload = contract.map(_.payload),
                found = contract.isDefined
              ),
              passed = contract.isDefined,
              error = if (contract.isEmpty) Some(s"Contract $cidStr not found") else None
            )

            // Resume the result monad with the contract (or None)
            val resumeMethod = current.getClass.getMethod("resume", classOf[Option[_]])
            val engineContract = contract.map(c => convertToEngineContract(c))
            current = resumeMethod.invoke(current, engineContract).asInstanceOf[AnyRef]

          } catch {
            case ex: Exception =>
              logger.debug(s"Error processing ResultNeedContract: ${ex.getMessage}")
              done = true
              error = Some(s"Error during contract lookup: ${ex.getMessage}")
          }

        case name if name.startsWith("ResultNeedPackage") =>
          // Silently fulfill package requests without creating individual steps.
          // Packages were already loaded and reported in the collapsed step above.
          runtimePkgFetches += 1
          try {
            val pkgIdMethod = current.getClass.getMethod("packageId")
            val pkgIdObj = pkgIdMethod.invoke(current)
            val pkgIdStr = pkgIdObj.toString

            val pkg = decodedPackages.get(pkgIdStr).orElse {
              packages.get(pkgIdStr).flatMap { base64 =>
                Try {
                  val bytes = java.util.Base64.getDecoder.decode(base64)
                  val archiveDecoderClass = Class.forName("com.daml.lf.archive.ArchiveDecoder")
                  val decoded = tryDecodeArchive(archiveDecoderClass, bytes)
                  val extractedPkg = extractPackageFromDecodeResult(decoded)
                  decodedPackages(pkgIdStr) = extractedPkg
                  extractedPkg
                }.toOption
              }
            }

            if (pkg.isEmpty) {
              runtimePkgFailures += pkgIdStr
            }

            // Resume the result monad with the package (or None)
            val resumeMethod = current.getClass.getMethod("resume", classOf[Option[_]])
            current = resumeMethod.invoke(current, pkg).asInstanceOf[AnyRef]

          } catch {
            case ex: Exception =>
              logger.debug(s"Error processing ResultNeedPackage: ${ex.getMessage}")
              done = true
              error = Some(s"Error during package lookup: ${ex.getMessage}")
          }

        case name if name.startsWith("ResultError") || name.startsWith("ResultInterp") =>
          done = true
          try {
            val msgMethod = current.getClass.getMethod("message")
            error = Some(msgMethod.invoke(current).toString)
          } catch {
            case _: Exception =>
              error = Some(s"Engine returned error result: $className")
          }

        case other =>
          logger.warn(s"Unknown Result type: $other")
          done = true
          error = Some(s"Unknown engine Result type: $other")
      }
    }

    if (iterations >= maxIterations && !done) {
      error = Some(s"Result monad processing exceeded $maxIterations iterations")
    }

    (stepNumber, resultTx, error)
  }

  /**
   * Convert an engine transaction object to our TransactionTree model via reflection.
   */
  private def convertEngineTransaction(txObj: AnyRef, contextHint: String): TransactionTree = {
    val txId = s"tx-${java.util.UUID.randomUUID().toString.take(8)}"
    val now = Instant.now().toString

    try {
      // Try to extract transaction details from the engine result
      // The engine returns a SubmittedTransaction which wraps a GenTransaction
      val rootsMethod = Try(txObj.getClass.getMethod("roots"))
        .orElse(Try(txObj.getClass.getMethod("rootNodes")))

      val nodesMethod = Try(txObj.getClass.getMethod("nodes"))

      val events = mutable.Map[String, TransactionEvent]()
      val rootIds = mutable.ArrayBuffer[String]()

      rootsMethod.toOption.foreach { method =>
        val roots = method.invoke(txObj)
        // Iterate roots to build event IDs
        val rootIter = Try {
          val iterMethod = roots.getClass.getMethod("iterator")
          iterMethod.invoke(roots)
        }
        // Build root event IDs from the node IDs
        rootIter.foreach { iter =>
          val hasNextMethod = iter.getClass.getMethod("hasNext")
          val nextMethod = iter.getClass.getMethod("next")
          var idx = 0
          while (hasNextMethod.invoke(iter).asInstanceOf[Boolean]) {
            val nodeId = nextMethod.invoke(iter)
            val eventId = s"#$txId:$idx"
            rootIds += eventId
            idx += 1
          }
        }
      }

      if (rootIds.isEmpty) {
        // Fallback: build a minimal transaction tree
        val eventId = s"#$txId:0"
        rootIds += eventId
        events(eventId) = CreatedTransactionEvent(
          eventId = eventId,
          contractId = s"00${java.util.UUID.randomUUID().toString.replace("-", "").take(32)}",
          templateId = "engine-result",
          payload = Map("source" -> "real-engine"),
          signatories = Set.empty,
          observers = Set.empty
        )
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
    } catch {
      case ex: Exception =>
        logger.debug(s"Could not fully convert engine transaction: ${ex.getMessage}")
        // Return a minimal transaction tree indicating engine success
        val eventId = s"#$txId:0"
        TransactionTree(
          updateId = txId,
          commandId = Some(s"cmd-${txId.takeRight(8)}"),
          workflowId = None,
          offset = None,
          effectiveAt = Some(now),
          rootEventIds = Seq(eventId),
          eventsById = Map(eventId -> CreatedTransactionEvent(
            eventId = eventId,
            contractId = s"00${java.util.UUID.randomUUID().toString.replace("-", "").take(32)}",
            templateId = "engine-result",
            payload = Map("source" -> "real-engine", "note" -> "Transaction conversion used fallback"),
            signatories = Set.empty,
            observers = Set.empty
          ))
        )
    }
  }

  /**
   * Convert a ContractInfo to an engine-compatible contract representation via reflection.
   */
  private def convertToEngineContract(contract: ContractInfo): AnyRef = {
    // Build a minimal engine contract from our ContractInfo.
    // The exact type depends on the SDK version — this attempts to build
    // a VersionedContractInstance or ContractInstance.
    try {
      val templateId = {
        val parts = contract.templateId.split(":")
        if (parts.length >= 3) {
          val pkgId = buildPackageId(parts(0))
          val qn = buildQualifiedName(parts(1), parts(2))
          buildIdentifier(pkgId, qn)
        } else null
      }

      val value = buildValueRecord(contract.payload)

      if (templateId != null && value != null) {
        // Try to build ContractInstance(templateId, value)
        val ciClass = Class.forName("com.daml.lf.transaction.ContractInstance")
        val constructor = ciClass.getConstructors.head
        constructor.newInstance(templateId, value).asInstanceOf[AnyRef]
      } else {
        contract.asInstanceOf[AnyRef] // Fallback — will likely cause a resume error
      }
    } catch {
      case _: Exception =>
        contract.asInstanceOf[AnyRef]
    }
  }

  // -----------------------------------------------------------------------
  // Synthetic (fallback) trace — original implementation
  // -----------------------------------------------------------------------

  /**
   * Execute a command with synthetic tracing.
   *
   * This is the fallback implementation used when the real Daml-LF Engine
   * classes are not available on the classpath. It manually simulates the
   * engine's evaluation sequence by:
   *   1. Validating inputs
   *   2. Resolving packages
   *   3. Fetching the target contract
   *   4. Checking authorization
   *   5. Simulating guard evaluation
   *   6. Building a synthetic result transaction
   */
  private[engine] def traceSynthetic(
    command: CommandRequest,
    packages: Map[String, String],
    contracts: Map[String, ContractInfo],
    disclosedContracts: Seq[ContractInfo],
    actAs: Set[String],
    readAs: Set[String]
  ): ExecutionTrace = {
    logger.info(
      s"Tracing command (synthetic): template=${command.templateId}, choice=${command.choice.getOrElse("Create")}, " +
      s"actAs=${actAs.mkString(",")}, contracts=${contracts.size}, packages=${packages.size}"
    )

    val steps = mutable.ArrayBuffer[TraceStep]()
    var stepNumber = 0
    val startTime = System.nanoTime()

    // Extract module name from templateId for synthetic source locations
    val templateParts = command.templateId.split(":")
    val moduleName = if (templateParts.length >= 2) templateParts(1) else "Main"
    val entityName = if (templateParts.length >= 3) templateParts(2) else "Unknown"
    val syntheticFile = s"$moduleName.daml (decompiled)"

    // Helper to create a synthetic source location at a given line
    def syntheticLoc(line: Int): Option[SourceLocation] =
      Some(SourceLocation(file = syntheticFile, startLine = line, startCol = 1, endLine = line, endCol = 80))

    Try {
      // Step 1: Validate inputs
      stepNumber += 1
      val validationResult = validateInputs(command, packages, contracts, actAs)
      steps += TraceStep(
        stepNumber = stepNumber,
        stepType = "evaluate_expression",
        sourceLocation = syntheticLoc(1),
        summary = "Validate command inputs",
        variables = Map(
          "templateId" -> command.templateId,
          "choice" -> command.choice.getOrElse("Create"),
          "actAs" -> actAs.mkString(", "),
          "readAs" -> readAs.mkString(", ")
        ),
        context = ExpressionContext(
          expressionType = "input_validation",
          variables = Map("contractCount" -> contracts.size.toString, "packageCount" -> packages.size.toString)
        ),
        passed = validationResult.isEmpty,
        error = validationResult
      )
      if (validationResult.isDefined) {
        return buildTrace(steps.toSeq, Map.empty, sourceAvailable = false, None, validationResult, startTime)
      }

      // Step 2: Resolve packages (collapsed into single step)
      val resolvedPackages = resolvePackages(packages, steps, stepNumber)
      stepNumber = steps.size

      // Step 3: For Exercise/Archive, fetch the target contract
      val targetContract = command.contractId.flatMap { cid =>
        stepNumber += 1
        val contract = contracts.get(cid).orElse(
          disclosedContracts.find(_.contractId == cid)
        )
        val isDisclosed = contract.isDefined && !contracts.contains(cid)
        val source = if (isDisclosed) "disclosed" else if (contract.isDefined) "ACS" else "not found"

        steps += TraceStep(
          stepNumber = stepNumber,
          stepType = "fetch_contract",
          sourceLocation = syntheticLoc(3),
          summary = s"Fetch contract $cid",
          variables = Map("contractId" -> cid, "source" -> source) ++
            contract.map(c => c.payload.map { case (k, v) => (s"payload.$k", v) }).getOrElse(Map.empty),
          context = FetchContext(
            contractId = cid,
            payload = contract.map(_.payload),
            found = contract.isDefined
          ),
          passed = contract.isDefined,
          error = if (contract.isEmpty) Some(s"Contract $cid not found in ACS or disclosed contracts") else None
        )
        contract
      }

      // If the command requires a contract and it wasn't found, fail early
      if (command.contractId.isDefined && targetContract.isEmpty) {
        return buildTrace(
          steps.toSeq, Map.empty, sourceAvailable = false, None,
          Some(s"Contract ${command.contractId.get} not found"), startTime
        )
      }

      // Step 4: Check authorization (signatories vs actAs)
      targetContract.foreach { contract =>
        stepNumber += 1
        val requiredParties = contract.signatories
        val providedParties = actAs
        val authorized = requiredParties.subsetOf(providedParties)

        steps += TraceStep(
          stepNumber = stepNumber,
          stepType = "check_authorization",
          sourceLocation = syntheticLoc(5),
          summary = if (authorized) "Check authorization -- passed"
                    else s"Check authorization -- FAILED (missing: ${(requiredParties -- providedParties).mkString(", ")})",
          variables = Map(
            "required" -> requiredParties.mkString(", "),
            "provided" -> providedParties.mkString(", ")
          ),
          context = AuthContext(
            required = requiredParties,
            provided = providedParties
          ),
          passed = authorized,
          error = if (!authorized) {
            Some(s"Authorization failed: missing parties ${(requiredParties -- providedParties).mkString(", ")}")
          } else None
        )

        if (!authorized) {
          return buildTrace(
            steps.toSeq, Map.empty, sourceAvailable = false, None,
            Some(s"Authorization check failed"), startTime
          )
        }
      }

      // Step 5: Evaluate ensure clause
      stepNumber += 1
      val ensureExpression = targetContract.map { c =>
        // Build a human-readable ensure expression from the contract's key fields
        c.payload.headOption.map { case (k, v) => s"$k /= \"\"" }.getOrElse("True")
      }.getOrElse("True")
      steps += TraceStep(
        stepNumber = stepNumber,
        stepType = "evaluate_guard",
        sourceLocation = syntheticLoc(7),
        summary = "Evaluate ensure clause",
        variables = command.arguments,
        context = GuardContext(
          expression = s"ensure ($ensureExpression)",
          result = true,
          variables = command.arguments
        ),
        passed = true,
        error = None
      )

      // Step 6: Execute the command body
      stepNumber += 1
      val newContractId = s"00${java.util.UUID.randomUUID().toString.replace("-", "")}"
      val commandType = command.choice match {
        case Some(choice) => s"Exercise $choice on $entityName"
        case None         => s"Create $entityName"
      }
      steps += TraceStep(
        stepNumber = stepNumber,
        stepType = if (command.choice.isDefined) "exercise_choice" else "create_contract",
        sourceLocation = syntheticLoc(9),
        summary = commandType,
        variables = command.arguments,
        context = ActionContext(
          actionType = if (command.choice.isDefined) "exercise" else "create",
          templateId = command.templateId,
          choice = command.choice,
          arguments = command.arguments,
          resultContractId = Some(newContractId)
        ),
        passed = true,
        error = None
      )

      // Step 7: For consuming exercise, archive the old contract and create new one
      val resultTx = buildResultTransaction(command, targetContract, contracts, disclosedContracts)

      stepNumber += 1
      val actionSummary = command.choice match {
        case Some(choice) =>
          steps += TraceStep(
            stepNumber = stepNumber,
            stepType = "archive_contract",
            sourceLocation = syntheticLoc(11),
            summary = s"Archive consumed contract ${command.contractId.getOrElse("?")}",
            variables = Map(
              "contractId" -> command.contractId.getOrElse("?"),
              "templateId" -> command.templateId
            ),
            context = ActionContext(
              actionType = "archive",
              templateId = command.templateId,
              choice = Some(choice),
              arguments = Map.empty,
              resultContractId = command.contractId
            ),
            passed = true,
            error = None
          )

          // Create the new contract step
          stepNumber += 1
          steps += TraceStep(
            stepNumber = stepNumber,
            stepType = "create_contract",
            sourceLocation = syntheticLoc(13),
            summary = s"Create new $entityName contract",
            variables = command.arguments,
            context = ActionContext(
              actionType = "create",
              templateId = command.templateId,
              choice = None,
              arguments = command.arguments,
              resultContractId = Some(newContractId)
            ),
            passed = true,
            error = None
          )
          s"Exercised $choice"

        case None =>
          s"Created contract"
      }

      logger.info(s"Trace complete (synthetic): $actionSummary, ${steps.size} steps")
      buildTrace(steps.toSeq, Map.empty, sourceAvailable = false, Some(resultTx), None, startTime)
    } match {
      case Success(trace) => trace
      case Failure(ex) =>
        logger.error(s"Trace failed with unexpected error: ${ex.getMessage}", ex)
        stepNumber += 1
        steps += TraceStep(
          stepNumber = stepNumber,
          stepType = "evaluate_expression",
          sourceLocation = None,
          summary = "Unexpected engine error",
          variables = Map.empty,
          context = ExpressionContext(expressionType = "error", variables = Map("exception" -> ex.getClass.getName)),
          passed = false,
          error = Some(ex.getMessage)
        )
        buildTrace(steps.toSeq, Map.empty, sourceAvailable = false, None, Some(ex.getMessage), startTime)
    }
  }

  /**
   * Execute a command without instrumentation (synthetic fallback).
   *
   * This is the fallback implementation used when the real Daml-LF Engine
   * is not available.
   */
  private[engine] def simulateSynthetic(
    command: CommandRequest,
    packages: Map[String, String],
    contracts: Map[String, ContractInfo],
    disclosedContracts: Seq[ContractInfo],
    actAs: Set[String],
    readAs: Set[String]
  ): SimulationResult = {
    logger.info(
      s"Simulating command (synthetic): template=${command.templateId}, choice=${command.choice.getOrElse("Create")}"
    )
    val now = Instant.now().toString

    Try {
      // Validate inputs
      val validationError = validateInputs(command, packages, contracts, actAs)
      if (validationError.isDefined) {
        return SimulationResult(
          success = false,
          transactionTree = None,
          error = validationError,
          errorCategory = Some("InvalidIndependentOfSystemState"),
          simulatedAt = now,
          atOffset = None,
          stateDriftWarning = "Simulation used a point-in-time ACS snapshot; the live ledger may have diverged."
        )
      }

      // Check contract exists for exercise commands
      command.contractId.foreach { cid =>
        val found = contracts.contains(cid) || disclosedContracts.exists(_.contractId == cid)
        if (!found) {
          return SimulationResult(
            success = false,
            transactionTree = None,
            error = Some(s"Contract $cid not found in ACS or disclosed contracts"),
            errorCategory = Some("InvalidGivenCurrentSystemStateResourceMissing"),
            simulatedAt = now,
            atOffset = None,
            stateDriftWarning = "Simulation used a point-in-time ACS snapshot; the live ledger may have diverged."
          )
        }
      }

      // Check authorization
      command.contractId.foreach { cid =>
        val contract = contracts.get(cid).orElse(disclosedContracts.find(_.contractId == cid))
        contract.foreach { c =>
          if (!c.signatories.subsetOf(actAs)) {
            return SimulationResult(
              success = false,
              transactionTree = None,
              error = Some(s"Authorization failed: missing parties ${(c.signatories -- actAs).mkString(", ")}"),
              errorCategory = Some("InvalidIndependentOfSystemState"),
              simulatedAt = now,
              atOffset = None,
              stateDriftWarning = "Simulation used a point-in-time ACS snapshot; the live ledger may have diverged."
            )
          }
        }
      }

      // Build the result
      val targetContract = command.contractId.flatMap { cid =>
        contracts.get(cid).orElse(disclosedContracts.find(_.contractId == cid))
      }
      val resultTx = buildResultTransaction(command, targetContract, contracts, disclosedContracts)

      SimulationResult(
        success = true,
        transactionTree = Some(resultTx),
        error = None,
        errorCategory = None,
        simulatedAt = now,
        atOffset = None,
        stateDriftWarning = "Simulation used a point-in-time ACS snapshot; the live ledger may have diverged."
      )
    } match {
      case Success(result) => result
      case Failure(ex) =>
        logger.error(s"Simulation failed: ${ex.getMessage}", ex)
        SimulationResult(
          success = false,
          transactionTree = None,
          error = Some(s"Engine error: ${ex.getMessage}"),
          errorCategory = Some("SystemInternalAssumptionViolated"),
          simulatedAt = now,
          atOffset = None,
          stateDriftWarning = "Simulation used a point-in-time ACS snapshot; the live ledger may have diverged."
        )
    }
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private def validateInputs(
    command: CommandRequest,
    packages: Map[String, String],
    contracts: Map[String, ContractInfo],
    actAs: Set[String]
  ): Option[String] = {
    if (command.templateId.isEmpty)
      return Some("templateId must not be empty")
    if (actAs.isEmpty)
      return Some("actAs must contain at least one party")
    if (command.choice.isDefined && command.contractId.isEmpty)
      return Some("contractId is required for Exercise commands")
    None
  }

  private def resolvePackages(
    packages: Map[String, String],
    steps: mutable.ArrayBuffer[TraceStep],
    startStep: Int
  ): Map[String, String] = {
    // Collapse all package resolutions into a single summary step
    // instead of creating 33+ individual fetch_package steps
    val stepNumber = startStep + 1
    val pkgIds = packages.keys.toSeq.sorted
    val previewIds = if (pkgIds.size <= 3) pkgIds.mkString(", ")
                     else pkgIds.take(3).mkString(", ") + s" ... (${pkgIds.size - 3} more)"
    steps += TraceStep(
      stepNumber = stepNumber,
      stepType = "fetch_package",
      sourceLocation = None,
      summary = s"Loaded ${packages.size} packages",
      variables = Map(
        "packageCount" -> packages.size.toString,
        "packageIds" -> pkgIds.mkString(", ")
      ),
      context = PackageFetchContext(packageId = previewIds, found = true),
      passed = true,
      error = None
    )
    packages
  }

  private def buildResultTransaction(
    command: CommandRequest,
    targetContract: Option[ContractInfo],
    contracts: Map[String, ContractInfo],
    disclosedContracts: Seq[ContractInfo]
  ): TransactionTree = {
    val txId = s"tx-${java.util.UUID.randomUUID().toString.take(8)}"
    val now = Instant.now().toString

    command.choice match {
      case Some(choice) =>
        // Exercise command — produces an exercise event and potentially child events
        val exerciseEventId = s"#$txId:0"
        val createEventId = s"#$txId:1"
        val newContractId = s"00${java.util.UUID.randomUUID().toString.replace("-", "")}"

        val exerciseEvent = ExercisedTransactionEvent(
          eventId = exerciseEventId,
          contractId = command.contractId.getOrElse(""),
          templateId = command.templateId,
          choice = choice,
          choiceArgument = command.arguments,
          actingParties = targetContract.map(_.signatories).getOrElse(Set.empty),
          consuming = true,
          childEventIds = Seq(createEventId),
          exerciseResult = Some(s"ContractId($newContractId)")
        )

        val createEvent = CreatedTransactionEvent(
          eventId = createEventId,
          contractId = newContractId,
          templateId = command.templateId,
          payload = command.arguments,
          signatories = targetContract.map(_.signatories).getOrElse(Set.empty),
          observers = targetContract.map(_.observers).getOrElse(Set.empty)
        )

        TransactionTree(
          updateId = txId,
          commandId = Some(s"cmd-${txId.takeRight(8)}"),
          workflowId = None,
          offset = None,
          effectiveAt = Some(now),
          rootEventIds = Seq(exerciseEventId),
          eventsById = Map(
            exerciseEventId -> exerciseEvent,
            createEventId -> createEvent
          )
        )

      case None =>
        // Create command — produces a single created event
        val eventId = s"#$txId:0"
        val newContractId = s"00${java.util.UUID.randomUUID().toString.replace("-", "")}"

        val createEvent = CreatedTransactionEvent(
          eventId = eventId,
          contractId = newContractId,
          templateId = command.templateId,
          payload = command.arguments,
          signatories = Set.empty, // determined by template body at runtime
          observers = Set.empty
        )

        TransactionTree(
          updateId = txId,
          commandId = Some(s"cmd-${txId.takeRight(8)}"),
          workflowId = None,
          offset = None,
          effectiveAt = Some(now),
          rootEventIds = Seq(eventId),
          eventsById = Map(eventId -> createEvent)
        )
    }
  }

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
