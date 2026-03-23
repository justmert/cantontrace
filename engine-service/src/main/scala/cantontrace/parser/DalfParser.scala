package cantontrace.parser

import cantontrace.model._
import com.typesafe.scalalogging.LazyLogging

import java.util.Base64
import scala.util.{Failure, Success, Try}

/**
 * Parser for Daml-LF archive (DALF) protobuf bytes.
 *
 * Extracts structured package metadata — modules, templates, choices,
 * keys, interfaces, and type definitions — from compiled DALF archives.
 * Uses the `daml-lf-archive-reader` library when available, falling back
 * to raw protobuf parsing otherwise.
 *
 * The extracted [[PackageDetail]] is served by the `/parse-dalf` endpoint
 * and consumed by the frontend's Template Explorer.
 *
 * Implementation notes:
 *   - Daml-LF archives are serialized as protobuf (DamlLf.Archive).
 *   - The archive contains a hash (package ID) and a payload that is
 *     itself a serialized DamlLf1.Package message.
 *   - We parse both layers to extract the full AST.
 *   - Field types are rendered as human-readable strings (e.g., "Int64",
 *     "Optional Text", "List (ContractId MyTemplate)").
 */
object DalfParser extends LazyLogging {

  /** Maximum size for a base64-encoded DALF input (100 MB of base64 ~ 75 MB decoded). */
  private val MaxBase64InputLength: Int = 100 * 1024 * 1024

  /**
   * Parse base64-encoded DALF bytes into a [[PackageDetail]].
   *
   * @param dalfBase64 the DALF archive bytes encoded as a base64 string
   * @return the parsed package metadata, or an error
   */
  def parse(dalfBase64: String): Either[String, PackageDetail] = {
    if (dalfBase64.length > MaxBase64InputLength) {
      return Left(s"DALF input too large: ${dalfBase64.length} base64 characters exceeds limit of $MaxBase64InputLength")
    }
    Try {
      val bytes = Base64.getDecoder.decode(dalfBase64)
      parseBytes(bytes)
    } match {
      case Success(result) => result
      case Failure(ex) =>
        logger.error(s"Failed to decode DALF base64: ${ex.getMessage}", ex)
        Left(s"Failed to decode DALF bytes: ${ex.getMessage}")
    }
  }

  /**
   * Parse raw DALF bytes into a [[PackageDetail]].
   */
  def parseBytes(bytes: Array[Byte]): Either[String, PackageDetail] = {
    Try {
      // The DALF archive is a protobuf DamlLf.Archive message.
      // Structure:
      //   Archive {
      //     hash_function: HashFunction (SHA256)
      //     payload: bytes (serialized DamlLf1.Package)
      //     hash: string (package ID = hex(sha256(payload)))
      //   }
      //
      // We use the daml-lf-archive-reader library to decode this properly.
      // When that library is not on the classpath (e.g., during initial build
      // before Daml SDK artifacts are resolved), we fall back to a lightweight
      // protobuf-based parser that extracts the essential structure.
      parseWithArchiveReader(bytes)
        .orElse(parseWithProtobuf(bytes))
        .getOrElse(Left("Failed to parse DALF archive with any available parser"))
    } match {
      case Success(result) => result
      case Failure(ex) =>
        logger.error(s"Failed to parse DALF bytes: ${ex.getMessage}", ex)
        Left(s"DALF parse error: ${ex.getMessage}")
    }
  }

  // -----------------------------------------------------------------------
  // Archive-reader based parser (primary)
  // -----------------------------------------------------------------------

  /**
   * Attempt to parse using the daml-lf-archive-reader library.
   * Returns None if the library is not available on the classpath.
   */
  private def parseWithArchiveReader(bytes: Array[Byte]): Option[Either[String, PackageDetail]] = {
    try {
      // Attempt to load the archive reader via reflection to handle the case
      // where the Daml SDK JARs are not yet on the classpath.
      val archiveClass = Class.forName("com.daml.lf.archive.DarReader")
      // If we get here, the library is available — use it.
      Some(parseWithArchiveReaderImpl(bytes))
    } catch {
      case _: ClassNotFoundException =>
        logger.info("daml-lf-archive-reader not on classpath, falling back to protobuf parser")
        None
      case ex: Exception =>
        logger.warn(s"Archive reader failed: ${ex.getMessage}, falling back to protobuf parser")
        None
    }
  }

  private def parseWithArchiveReaderImpl(bytes: Array[Byte]): Either[String, PackageDetail] = {
    Try {
      // Use the Daml LF archive reader to decode the archive into an AST.
      //
      // The actual integration code:
      //   val archive = DamlLf.Archive.parseFrom(bytes)
      //   val (pkgId, pkg) = Decode.decodeArchivePayload(archive)
      //   convertPackage(pkgId, pkg)
      //
      // For now, we parse the protobuf envelope to get the package ID, then
      // delegate to the protobuf parser for the payload. When the Daml SDK
      // is on the classpath, this will be replaced with the full Decode path.
      parseProtobufEnvelope(bytes)
    } match {
      case Success(result) => result
      case Failure(ex) =>
        Left(s"Archive reader error: ${ex.getMessage}")
    }
  }

  // -----------------------------------------------------------------------
  // Protobuf-based fallback parser
  // -----------------------------------------------------------------------

  /**
   * Parse using raw protobuf deserialization — works without the Daml SDK
   * on the classpath. Extracts the essential structure from the DALF.
   */
  private def parseWithProtobuf(bytes: Array[Byte]): Option[Either[String, PackageDetail]] = {
    Some(parseProtobufEnvelope(bytes))
  }

  private def parseProtobufEnvelope(bytes: Array[Byte]): Either[String, PackageDetail] = {
    Try {
      import com.digitalasset.daml.lf.archive.{DamlLf, DamlLf2}

      // Parse the outer Archive using the generated protobuf classes
      val archive = DamlLf.Archive.parseFrom(bytes)
      val hash = archive.getHash
      val payloadBytes = archive.getPayload.toByteArray

      logger.debug(s"Archive envelope: hash=$hash, payload=${payloadBytes.length} bytes")

      // Parse the ArchivePayload
      val archivePayload = DamlLf.ArchivePayload.parseFrom(payloadBytes)
      val minor = archivePayload.getMinor
      logger.debug(s"ArchivePayload: minor='$minor', sumCase=${archivePayload.getSumCase}")

      // Parse the Package from the ArchivePayload
      val modules: Seq[ModuleDetail] = archivePayload.getSumCase.getNumber match {
        case 4 => // daml_lf_2
          val pkg = DamlLf2.Package.parseFrom(archivePayload.getDamlLf2)
          parsePackageFromProto2(pkg)
        case 2 => // daml_lf_1 (fallback)
          logger.info("Using LF 1.x path")
          parsePackagePayload(payloadBytes)
        case other =>
          logger.warn(s"Unknown ArchivePayload sum case: $other")
          parsePackagePayload(payloadBytes)
      }

      val metadata = if (archivePayload.getSumCase.getNumber == 4) {
        val pkg = DamlLf2.Package.parseFrom(archivePayload.getDamlLf2)
        if (pkg.hasMetadata) Some(pkg) else None
      } else None

      PackageDetail(
        packageId = if (hash.nonEmpty) hash else computePackageHash(payloadBytes),
        packageName = metadata.map(p => resolveInternedString2(p, p.getMetadata.getNameInternedStr)),
        packageVersion = metadata.map(p => resolveInternedString2(p, p.getMetadata.getVersionInternedStr)),
        modules = modules,
        hasSource = false
      )
    } match {
      case Success(detail) => Right(detail)
      case Failure(ex) =>
        logger.error(s"Protobuf parse failed: ${ex.getMessage}", ex)
        Left(s"Protobuf parse error: ${ex.getMessage}")
    }
  }

  /**
   * Parse a Daml-LF 2.x Package using the generated protobuf Java classes.
   * This is far more reliable than manual protobuf wire parsing.
   *
   * Extracts full metadata including:
   *   - Template fields (from the associated DefDataType record)
   *   - Choice parameters (from arg_binder type) and return types
   *   - Signatory and observer expressions
   *   - Key definitions
   */
  private def parsePackageFromProto2(pkg: com.digitalasset.daml.lf.archive.DamlLf2.Package): Seq[ModuleDetail] = {
    import com.digitalasset.daml.lf.archive.DamlLf2
    import scala.jdk.CollectionConverters._

    val internedStrings = pkg.getInternedStringsList.asScala.toIndexedSeq
    val internedDottedNames = pkg.getInternedDottedNamesList.asScala.map { idn =>
      idn.getSegmentsInternedStrList.asScala.map(_.intValue()).toSeq
    }.toIndexedSeq
    val internedTypes = pkg.getInternedTypesList.asScala.toIndexedSeq
    val internedExprs = pkg.getInternedExprsList.asScala.toIndexedSeq

    logger.info(s"DamlLf2 Package: ${pkg.getModulesCount} modules, " +
      s"${internedStrings.size} interned strings, " +
      s"${internedDottedNames.size} interned dotted names, " +
      s"${internedTypes.size} interned types, " +
      s"${internedExprs.size} interned exprs")

    def resolveStr(idx: Int): String =
      if (idx >= 0 && idx < internedStrings.size) internedStrings(idx) else s"<str_$idx>"

    def resolveDN(idx: Int): String = {
      if (idx >= 0 && idx < internedDottedNames.size) {
        internedDottedNames(idx).map(resolveStr).mkString(".")
      } else s"<dn_$idx>"
    }

    // --- Type → String rendering ---------------------------------------------------

    def renderBuiltinType(bt: DamlLf2.BuiltinType): String = bt match {
      case DamlLf2.BuiltinType.INT64           => "Int64"
      case DamlLf2.BuiltinType.TEXT            => "Text"
      case DamlLf2.BuiltinType.BOOL            => "Bool"
      case DamlLf2.BuiltinType.NUMERIC         => "Numeric"
      case DamlLf2.BuiltinType.PARTY           => "Party"
      case DamlLf2.BuiltinType.DATE            => "Date"
      case DamlLf2.BuiltinType.TIMESTAMP       => "Timestamp"
      case DamlLf2.BuiltinType.CONTRACT_ID     => "ContractId"
      case DamlLf2.BuiltinType.LIST            => "List"
      case DamlLf2.BuiltinType.OPTIONAL        => "Optional"
      case DamlLf2.BuiltinType.TEXTMAP         => "TextMap"
      case DamlLf2.BuiltinType.GENMAP          => "GenMap"
      case DamlLf2.BuiltinType.UNIT            => "Unit"
      case DamlLf2.BuiltinType.ARROW           => "Arrow"
      case DamlLf2.BuiltinType.ANY             => "Any"
      case DamlLf2.BuiltinType.TYPE_REP        => "TypeRep"
      case DamlLf2.BuiltinType.UPDATE          => "Update"
      case DamlLf2.BuiltinType.BIGNUMERIC      => "BigNumeric"
      case DamlLf2.BuiltinType.ROUNDING_MODE   => "RoundingMode"
      case DamlLf2.BuiltinType.ANY_EXCEPTION   => "AnyException"
      case other                                => other.name()
    }

    def renderType2(typ: DamlLf2.Type): String = {
      try {
        typ.getSumCase match {
          case DamlLf2.Type.SumCase.INTERNED_TYPE =>
            val idx = typ.getInternedType
            if (idx >= 0 && idx < internedTypes.size) renderType2(internedTypes(idx))
            else s"<interned_type_$idx>"

          case DamlLf2.Type.SumCase.BUILTIN =>
            val builtin = typ.getBuiltin
            val baseName = renderBuiltinType(builtin.getBuiltin)
            val args = builtin.getArgsList.asScala.map(renderType2)
            if (args.isEmpty) baseName
            else s"$baseName ${args.map(a => if (a.contains(" ")) s"($a)" else a).mkString(" ")}"

          case DamlLf2.Type.SumCase.CON =>
            val con = typ.getCon
            val tycon = con.getTycon
            val typeName = resolveDN(tycon.getNameInternedDname)
            // Use just the last segment for readability (e.g., "MyTemplate" instead of "Module.MyTemplate")
            val shortName = typeName.split('.').lastOption.getOrElse(typeName)
            val args = con.getArgsList.asScala.map(renderType2)
            if (args.isEmpty) shortName
            else s"$shortName ${args.map(a => if (a.contains(" ")) s"($a)" else a).mkString(" ")}"

          case DamlLf2.Type.SumCase.VAR =>
            val v = typ.getVar
            val varName = resolveStr(v.getVarInternedStr)
            val args = v.getArgsList.asScala.map(renderType2)
            if (args.isEmpty) varName
            else s"$varName ${args.map(a => if (a.contains(" ")) s"($a)" else a).mkString(" ")}"

          case DamlLf2.Type.SumCase.FORALL =>
            val body = renderType2(typ.getForall.getBody)
            body

          case DamlLf2.Type.SumCase.STRUCT =>
            val fields = typ.getStruct.getFieldsList.asScala.map { fwt =>
              val fn = resolveStr(fwt.getFieldInternedStr)
              val ft = renderType2(fwt.getType)
              s"$fn: $ft"
            }
            s"(${fields.mkString(", ")})"

          case DamlLf2.Type.SumCase.SYN =>
            val syn = typ.getSyn
            val synName = resolveDN(syn.getTysyn.getNameInternedDname)
            synName.split('.').lastOption.getOrElse(synName)

          case DamlLf2.Type.SumCase.TAPP =>
            val tapp = typ.getTapp
            val fun = renderType2(tapp.getLhs)
            val arg = renderType2(tapp.getRhs)
            if (arg.contains(" ")) s"$fun ($arg)" else s"$fun $arg"

          case DamlLf2.Type.SumCase.NAT =>
            typ.getNat.toString

          case DamlLf2.Type.SumCase.SUM_NOT_SET | _ =>
            "<type>"
        }
      } catch {
        case ex: Exception =>
          logger.debug(s"renderType2 failed: ${ex.getMessage}")
          "<type>"
      }
    }

    // --- Expr → String rendering (best-effort for signatories/observers) -----------

    def renderExpr2(expr: DamlLf2.Expr, depth: Int = 0): String = {
      if (depth > 20) return "<...>" // prevent infinite recursion
      try {
        expr.getSumCase match {
          case DamlLf2.Expr.SumCase.VAR_INTERNED_STR =>
            resolveStr(expr.getVarInternedStr)

          case DamlLf2.Expr.SumCase.BUILTIN_CON =>
            expr.getBuiltinCon match {
              case DamlLf2.BuiltinCon.CON_TRUE  => "True"
              case DamlLf2.BuiltinCon.CON_FALSE => "False"
              case DamlLf2.BuiltinCon.CON_UNIT  => "()"
              case _                             => "<builtin>"
            }

          case DamlLf2.Expr.SumCase.BUILTIN_LIT =>
            val lit = expr.getBuiltinLit
            lit.getSumCase match {
              case DamlLf2.BuiltinLit.SumCase.TEXT_INTERNED_STR =>
                s"\"${resolveStr(lit.getTextInternedStr)}\""
              case DamlLf2.BuiltinLit.SumCase.NUMERIC_INTERNED_STR =>
                resolveStr(lit.getNumericInternedStr)
              case DamlLf2.BuiltinLit.SumCase.TIMESTAMP =>
                lit.getTimestamp.toString
              case DamlLf2.BuiltinLit.SumCase.DATE =>
                lit.getDate.toString
              case _ => "<literal>"
            }

          case DamlLf2.Expr.SumCase.REC_PROJ =>
            val proj = expr.getRecProj
            val record = renderExpr2(proj.getRecord, depth + 1)
            val fieldName = resolveStr(proj.getFieldInternedStr)
            s"$record.$fieldName"

          case DamlLf2.Expr.SumCase.STRUCT_PROJ =>
            val proj = expr.getStructProj
            val struct = renderExpr2(proj.getStruct, depth + 1)
            val fieldName = resolveStr(proj.getFieldInternedStr)
            s"$struct.$fieldName"

          case DamlLf2.Expr.SumCase.APP =>
            val app = expr.getApp
            val fun = renderExpr2(app.getFun, depth + 1)
            val args = app.getArgsList.asScala.map(a => renderExpr2(a, depth + 1))
            if (args.size == 1) s"$fun ${args.head}"
            else s"$fun(${args.mkString(", ")})"

          case DamlLf2.Expr.SumCase.ABS =>
            val abs = expr.getAbs
            val params = abs.getParamList.asScala.map(p => resolveStr(p.getVarInternedStr))
            val body = renderExpr2(abs.getBody, depth + 1)
            if (params.size == 1) body // For simple lambdas, just show the body
            else s"(\\${params.mkString(" ")} -> $body)"

          case DamlLf2.Expr.SumCase.TY_APP =>
            // Type application — skip the type argument, show the expression
            renderExpr2(expr.getTyApp.getExpr, depth + 1)

          case DamlLf2.Expr.SumCase.TY_ABS =>
            // Type abstraction — skip the type binder, show the body
            renderExpr2(expr.getTyAbs.getBody, depth + 1)

          case DamlLf2.Expr.SumCase.CONS =>
            val cons = expr.getCons
            val elems = cons.getFrontList.asScala.map(e => renderExpr2(e, depth + 1))
            s"[${elems.mkString(", ")}]"

          case DamlLf2.Expr.SumCase.NIL =>
            "[]"

          case DamlLf2.Expr.SumCase.OPTIONAL_NONE =>
            "None"

          case DamlLf2.Expr.SumCase.OPTIONAL_SOME =>
            val body = renderExpr2(expr.getOptionalSome.getValue, depth + 1)
            s"Some($body)"

          case DamlLf2.Expr.SumCase.BUILTIN =>
            val bf = expr.getBuiltin
            bf.name().toLowerCase.replace("_", " ")

          case DamlLf2.Expr.SumCase.VAL =>
            val v = expr.getVal
            val valName = resolveDN(v.getNameInternedDname)
            valName.split('.').lastOption.getOrElse(valName)

          case DamlLf2.Expr.SumCase.REC_CON =>
            val recCon = expr.getRecCon
            val fields = recCon.getFieldsList.asScala.map { fwe =>
              val fn = resolveStr(fwe.getFieldInternedStr)
              val fv = renderExpr2(fwe.getExpr, depth + 1)
              s"$fn = $fv"
            }
            s"{${fields.mkString(", ")}}"

          case DamlLf2.Expr.SumCase.CASE =>
            val caseExpr = expr.getCase
            val scrut = renderExpr2(caseExpr.getScrut, depth + 1)
            s"case $scrut of ..."

          case DamlLf2.Expr.SumCase.LET =>
            val block = expr.getLet
            renderExpr2(block.getBody, depth + 1)

          case DamlLf2.Expr.SumCase.ENUM_CON =>
            val ec = expr.getEnumCon
            resolveStr(ec.getEnumConInternedStr)

          case DamlLf2.Expr.SumCase.INTERNED_EXPR =>
            val idx = expr.getInternedExpr
            if (idx >= 0 && idx < internedExprs.size) renderExpr2(internedExprs(idx), depth + 1)
            else s"<interned_expr_$idx>"

          case DamlLf2.Expr.SumCase.SUM_NOT_SET | _ =>
            "<expr>"
        }
      } catch {
        case ex: Exception =>
          logger.debug(s"renderExpr2 failed: ${ex.getMessage}")
          "<expr>"
      }
    }

    /** Simplify rendered expressions for readability. */
    def simplifyExpr(raw: String): String = {
      val trimmed = raw.trim
      // Pattern: simple field reference "this.issuer" -> "issuer"
      if (trimmed.startsWith("this.") && !trimmed.drop(5).contains('.') && !trimmed.contains(' '))
        return trimmed.drop(5)
      // Pattern: list of field references "[this.issuer]" or "[this.issuer, this.owner]"
      if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        val inner = trimmed.drop(1).dropRight(1).trim
        val parts = inner.split(",").map(_.trim)
        val simplified = parts.flatMap { p =>
          if (p.startsWith("this.") && !p.drop(5).contains('.') && !p.drop(5).contains(' '))
            Some(p.drop(5))
          else if (p.nonEmpty) Some(p)
          else None
        }
        if (simplified.nonEmpty) return simplified.mkString(", ")
      }
      trimmed
    }

    // --- Resolve a type through interning to check its actual structure ---

    def resolveType(typ: DamlLf2.Type): DamlLf2.Type = {
      if (typ.getSumCase == DamlLf2.Type.SumCase.INTERNED_TYPE) {
        val idx = typ.getInternedType
        if (idx >= 0 && idx < internedTypes.size) resolveType(internedTypes(idx))
        else typ
      } else typ
    }

    def isOptionalType(typ: DamlLf2.Type): Boolean = {
      val resolved = resolveType(typ)
      (resolved.getSumCase == DamlLf2.Type.SumCase.BUILTIN &&
        resolved.getBuiltin.getBuiltin == DamlLf2.BuiltinType.OPTIONAL) ||
      // Also detect when rendered type starts with "Optional"
      renderType2(typ).startsWith("Optional")
    }

    // --- Extract fields from a DefDataType record ---------------------------------

    def extractRecordFields(dt: DamlLf2.DefDataType): Seq[FieldDefinition] = {
      try {
        if (dt.getDataConsCase == DamlLf2.DefDataType.DataConsCase.RECORD) {
          val record = dt.getRecord
          record.getFieldsList.asScala.map { fwt =>
            val fieldName = resolveStr(fwt.getFieldInternedStr)
            val fieldType = renderType2(fwt.getType)
            val isOptional = isOptionalType(fwt.getType)
            FieldDefinition(
              name = fieldName,
              fieldType = fieldType,
              optional = isOptional
            )
          }.toSeq
        } else Seq.empty
      } catch {
        case ex: Exception =>
          logger.debug(s"extractRecordFields failed: ${ex.getMessage}")
          Seq.empty
      }
    }

    // --- Extract choice parameters from arg binder type ---------------------------

    def extractChoiceParams(choice: DamlLf2.TemplateChoice, dataTypeMap: Map[String, DamlLf2.DefDataType]): Seq[FieldDefinition] = {
      try {
        if (choice.hasArgBinder) {
          val argType = choice.getArgBinder.getType
          // Resolve through interning so we see the actual type structure
          val resolved = resolveType(argType)
          // The arg type is typically a type constructor referencing a record data type
          resolved.getSumCase match {
            case DamlLf2.Type.SumCase.CON =>
              val typeName = resolveDN(resolved.getCon.getTycon.getNameInternedDname)
              dataTypeMap.get(typeName) match {
                case Some(dt) => extractRecordFields(dt)
                case None =>
                  // Single-field choice or unresolvable type
                  Seq(FieldDefinition(
                    name = resolveStr(choice.getArgBinder.getVarInternedStr),
                    fieldType = renderType2(argType),
                    optional = false
                  ))
              }
            case DamlLf2.Type.SumCase.BUILTIN =>
              // Primitive type as choice argument (e.g., a simple Text or Int64 arg)
              Seq(FieldDefinition(
                name = resolveStr(choice.getArgBinder.getVarInternedStr),
                fieldType = renderType2(argType),
                optional = false
              ))
            case _ =>
              Seq(FieldDefinition(
                name = resolveStr(choice.getArgBinder.getVarInternedStr),
                fieldType = renderType2(argType),
                optional = false
              ))
          }
        } else Seq.empty
      } catch {
        case ex: Exception =>
          logger.debug(s"extractChoiceParams failed: ${ex.getMessage}")
          Seq.empty
      }
    }

    // --- Extract key definition ---------------------------------------------------

    def extractKey(tmpl: DamlLf2.DefTemplate): Option[KeyDefinition] = {
      try {
        if (tmpl.hasKey) {
          val key = tmpl.getKey
          val keyType = if (key.hasType) renderType2(key.getType) else "<type>"
          val keyExpr = if (key.hasKeyExpr) renderExpr2(key.getKeyExpr) else "<expr>"
          val maintainer = if (key.hasMaintainers) renderExpr2(key.getMaintainers) else "<expr>"
          Some(KeyDefinition(
            keyType = keyType,
            expression = simplifyExpr(keyExpr),
            maintainerExpression = simplifyExpr(maintainer)
          ))
        } else None
      } catch {
        case ex: Exception =>
          logger.debug(s"extractKey failed: ${ex.getMessage}")
          None
      }
    }

    // --- Module-level processing --------------------------------------------------

    pkg.getModulesList.asScala.map { mod =>
      val moduleName = resolveDN(mod.getNameInternedDname)

      // Step 1: Build a map of data_type_name -> DefDataType for the module
      val dataTypeMap: Map[String, DamlLf2.DefDataType] = mod.getDataTypesList.asScala.flatMap { dt =>
        try {
          val dtName = resolveDN(dt.getNameInternedDname)
          if (dtName.nonEmpty) Some(dtName -> dt) else None
        } catch {
          case _: Exception => None
        }
      }.toMap

      // Build a map of value_name -> DefValue.Expr for resolving $$csignatory etc.
      val valueExprMap: Map[String, DamlLf2.Expr] = mod.getValuesList.asScala.flatMap { dv =>
        try {
          val valName = resolveDN(dv.getNameWithType.getNameInternedDname)
          if (valName.nonEmpty && dv.hasExpr) Some(valName -> dv.getExpr) else None
        } catch {
          case _: Exception => None
        }
      }.toMap

      /** Resolve an Expr through interning. */
      def resolveExpr(expr: DamlLf2.Expr): DamlLf2.Expr = {
        if (expr.getSumCase == DamlLf2.Expr.SumCase.INTERNED_EXPR) {
          val idx = expr.getInternedExpr
          if (idx >= 0 && idx < internedExprs.size) resolveExpr(internedExprs(idx))
          else expr
        } else expr
      }

      /**
       * Extract field names referenced via RecProj from an Expr tree.
       * This walks the expression looking for patterns like `this.fieldName`.
       */
      def extractFieldProjections(expr: DamlLf2.Expr, depth: Int = 0): Seq[String] = {
        if (depth > 30) return Seq.empty
        val resolved = resolveExpr(expr)
        resolved.getSumCase match {
          case DamlLf2.Expr.SumCase.REC_PROJ =>
            val proj = resolved.getRecProj
            Seq(resolveStr(proj.getFieldInternedStr))
          case DamlLf2.Expr.SumCase.APP =>
            val app = resolved.getApp
            val funProjs = extractFieldProjections(app.getFun, depth + 1)
            val argProjs = app.getArgsList.asScala.flatMap(a => extractFieldProjections(a, depth + 1))
            funProjs ++ argProjs
          case DamlLf2.Expr.SumCase.ABS =>
            extractFieldProjections(resolved.getAbs.getBody, depth + 1)
          case DamlLf2.Expr.SumCase.TY_APP =>
            extractFieldProjections(resolved.getTyApp.getExpr, depth + 1)
          case DamlLf2.Expr.SumCase.TY_ABS =>
            extractFieldProjections(resolved.getTyAbs.getBody, depth + 1)
          case DamlLf2.Expr.SumCase.CONS =>
            resolved.getCons.getFrontList.asScala.flatMap(e => extractFieldProjections(e, depth + 1)).toSeq
          case DamlLf2.Expr.SumCase.LET =>
            val block = resolved.getLet
            val bindingProjs = block.getBindingsList.asScala.flatMap(b => extractFieldProjections(b.getBound, depth + 1))
            val bodyProjs = extractFieldProjections(block.getBody, depth + 1)
            bindingProjs.toSeq ++ bodyProjs
          case DamlLf2.Expr.SumCase.VAL =>
            // Inline simple value references ($$csignatory etc.)
            val valName = resolveDN(resolved.getVal.getNameInternedDname)
            valueExprMap.get(valName) match {
              case Some(bodyExpr) => extractFieldProjections(bodyExpr, depth + 1)
              case None => Seq.empty
            }
          case _ => Seq.empty
        }
      }

      /** Render an expression, falling back to field projection extraction for compiler-generated functions. */
      def renderExprInlined(expr: DamlLf2.Expr, depth: Int = 0): String = {
        if (depth > 20) return "<...>"
        val rendered = renderExpr2(expr, depth)
        // If result contains compiler-generated names, try extracting field projections instead
        if (rendered.contains("$$c")) {
          val fields = extractFieldProjections(expr)
          if (fields.nonEmpty) return fields.distinct.mkString(", ")
          // If no field projections found, the expression likely resolves to an empty list
          // Check if the underlying function returns []
          val resolved = resolveExpr(expr)
          if (resolved.getSumCase == DamlLf2.Expr.SumCase.APP) {
            val app = resolved.getApp
            var funExpr = resolveExpr(app.getFun)
            while (funExpr.getSumCase == DamlLf2.Expr.SumCase.TY_APP) funExpr = resolveExpr(funExpr.getTyApp.getExpr)
            if (funExpr.getSumCase == DamlLf2.Expr.SumCase.VAL) {
              val valName = resolveDN(funExpr.getVal.getNameInternedDname)
              valueExprMap.get(valName) match {
                case Some(bodyExpr) =>
                  val bodyRendered = renderExpr2(bodyExpr, depth + 1)
                  val simplified = simplifyExpr(bodyRendered)
                  if (!simplified.contains("$$")) return simplified
                case None =>
              }
            }
          }
        }
        rendered
      }

      logger.debug(s"Module '$moduleName': ${dataTypeMap.size} data types, ${valueExprMap.size} value defs")

      val templates = mod.getTemplatesList.asScala.flatMap { tmpl =>
        val tmplName = resolveDN(tmpl.getTyconInternedDname)

        // Step 2: Extract template fields from matching data type
        val fields = dataTypeMap.get(tmplName) match {
          case Some(dt) => extractRecordFields(dt)
          case None =>
            logger.debug(s"Template '$tmplName': no matching data type found")
            Seq.empty
        }

        // Step 3: Extract choices with parameters and return types
        val choices = tmpl.getChoicesList.asScala.flatMap { choice =>
          val choiceName = resolveStr(choice.getNameInternedStr)
          if (choiceName.nonEmpty) {
            val params = extractChoiceParams(choice, dataTypeMap)
            val retType = if (choice.hasRetType) renderType2(choice.getRetType) else "<type>"
            val ctrlExpr = if (choice.hasControllers) simplifyExpr(renderExpr2(choice.getControllers))
                           else "<parsed from DALF>"
            Some(ChoiceDefinition(
              name = choiceName,
              consuming = choice.getConsuming,
              parameters = params,
              returnType = retType,
              controllerExpression = ctrlExpr,
              sourceCode = None,
              decompiledLF = None
            ))
          } else None
        }.toSeq

        // Step 4: Extract signatory and observer expressions (with value inlining)
        val sigExpr = if (tmpl.hasSignatories) simplifyExpr(renderExprInlined(tmpl.getSignatories))
                      else "<parsed from DALF>"
        val obsExpr = if (tmpl.hasObservers) simplifyExpr(renderExprInlined(tmpl.getObservers))
                      else "<parsed from DALF>"
        val ensureExpr = if (tmpl.hasPrecond) {
          val rendered = renderExprInlined(tmpl.getPrecond)
          if (rendered == "True" || rendered == "<expr>") None else Some(rendered)
        } else None

        // Step 5: Extract key definition
        val keyDef = extractKey(tmpl)

        if (tmplName.nonEmpty)
          Some(TemplateDefinition(
            name = tmplName,
            fields = fields,
            choices = choices,
            key = keyDef,
            signatoryExpression = sigExpr,
            observerExpression = obsExpr,
            ensureExpression = ensureExpr,
            implements = tmpl.getImplementsList.asScala.map { impl =>
              val iface = impl.getInterface
              val ifaceModName = resolveDN(iface.getModule.getModuleNameInternedDname)
              val ifaceTypeName = resolveDN(iface.getNameInternedDname)
              s"$ifaceModName:$ifaceTypeName"
            }.toSeq,
            sourceCode = None,
            decompiledLF = None
          ))
        else None
      }.toSeq

      val interfaces = mod.getInterfacesList.asScala.flatMap { iface =>
        val ifaceName = resolveDN(iface.getTyconInternedDname)
        val choices = iface.getChoicesList.asScala.flatMap { choice =>
          val choiceName = resolveStr(choice.getNameInternedStr)
          if (choiceName.nonEmpty) {
            val params = extractChoiceParams(choice, dataTypeMap)
            val retType = if (choice.hasRetType) renderType2(choice.getRetType) else "<type>"
            val ctrlExpr = if (choice.hasControllers) simplifyExpr(renderExpr2(choice.getControllers))
                           else "<parsed from DALF>"
            Some(ChoiceDefinition(
              name = choiceName,
              consuming = choice.getConsuming,
              parameters = params,
              returnType = retType,
              controllerExpression = ctrlExpr,
              sourceCode = None,
              decompiledLF = None
            ))
          } else None
        }.toSeq

        // Extract interface methods from the methods list
        val methods = iface.getMethodsList.asScala.map { method =>
          val methodName = resolveDN(method.getMethodInternedName)
          val methodType = if (method.hasType) renderType2(method.getType) else "<type>"
          FieldDefinition(name = methodName, fieldType = methodType, optional = false)
        }.toSeq

        if (ifaceName.nonEmpty) Some(InterfaceDefinition(ifaceName, methods, choices))
        else None
      }.toSeq

      // Extract type definitions with field info
      val typeDefinitions = mod.getDataTypesList.asScala.flatMap { dt =>
        try {
          val typeName = resolveDN(dt.getNameInternedDname)
          val serializable = dt.getSerializable
          val representation = dt.getDataConsCase match {
            case DamlLf2.DefDataType.DataConsCase.RECORD => "record"
            case DamlLf2.DefDataType.DataConsCase.VARIANT => "variant"
            case DamlLf2.DefDataType.DataConsCase.ENUM => "enum"
            case _ => "unknown"
          }
          if (typeName.nonEmpty) Some(TypeDefinition(typeName, serializable, representation))
          else None
        } catch {
          case _: Exception => None
        }
      }.toSeq

      logger.info(s"Module '$moduleName': ${templates.size} templates, ${interfaces.size} interfaces, ${typeDefinitions.size} types")

      ModuleDetail(
        name = moduleName,
        templates = templates,
        interfaces = interfaces,
        typeDefinitions = typeDefinitions
      )
    }.toSeq
  }

  /** Resolve an interned string from a DamlLf2 Package. */
  private def resolveInternedString2(pkg: com.digitalasset.daml.lf.archive.DamlLf2.Package, idx: Int): String = {
    if (idx >= 0 && idx < pkg.getInternedStringsCount) pkg.getInternedStrings(idx)
    else s"<str_$idx>"
  }

  /**
   * Parse the Archive payload to extract module definitions.
   *
   * The payload from DamlLf.Archive is an ArchivePayload message:
   * {{{
   *   message ArchivePayload {
   *     // (field 1 was daml_lf_0, deprecated)
   *     Package daml_lf_1 = 2;  // Daml-LF 1.x
   *     string minor = 3;       // Minor version string
   *     Package daml_lf_2 = 4;  // Daml-LF 2.x (Canton 3.4+)
   *   }
   * }}}
   *
   * Package structure:
   * {{{
   *   message Package {
   *     repeated Module modules = 1;
   *     // ... metadata fields (interned strings, etc.)
   *   }
   *
   *   message Module {
   *     DottedName name = 1;
   *     repeated DefTemplate templates = 3;
   *     repeated DefDataType data_types = 4;
   *     repeated DefValue values = 5;
   *   }
   * }}}
   */
  private def parsePackagePayload(payload: Array[Byte]): Seq[ModuleDetail] = {
    if (payload.isEmpty) {
      logger.warn("parsePackagePayload: empty payload")
      return Seq.empty
    }

    try {
      val input = com.google.protobuf.CodedInputStream.newInstance(payload)
      input.setSizeLimit(payload.length + 10)
      val modules = scala.collection.mutable.ArrayBuffer[ModuleDetail]()
      var packageBytes: Array[Byte] = null
      var minorVersion = ""

      var done = false
      while (!done) {
        val tag = input.readTag()
        val fieldNum = tag >>> 3
        val wireType = tag & 0x07
        tag match {
          case 0 => done = true
          // ArchivePayload.daml_lf_1 (field 2) — Daml-LF 1.x Package
          case 18 =>
            packageBytes = input.readByteArray()
            logger.debug(s"parsePackagePayload: found daml_lf_1 Package (${packageBytes.length} bytes)")
          // ArchivePayload.minor (field 3) — minor version string
          case 26 =>
            minorVersion = input.readString()
            logger.debug(s"parsePackagePayload: minor version = '$minorVersion'")
          // ArchivePayload.daml_lf_2 (field 4) — Daml-LF 2.x Package
          case 34 =>
            packageBytes = input.readByteArray()
            logger.debug(s"parsePackagePayload: found daml_lf_2 Package (${packageBytes.length} bytes)")
          // Package.modules (field 1) — if payload IS a raw Package (legacy)
          case 10 =>
            val moduleBytes = input.readByteArray()
            logger.debug(s"parsePackagePayload: found legacy module (${moduleBytes.length} bytes)")
            parseModuleMessage(moduleBytes, EmptyCtx).foreach(modules += _)
          case _ =>
            logger.debug(s"parsePackagePayload: skipping field=$fieldNum wireType=$wireType")
            input.skipField(tag)
        }
      }

      logger.debug(s"parsePackagePayload: packageBytes=${if (packageBytes != null) packageBytes.length else "null"}, legacyModules=${modules.size}")

      // If we found an ArchivePayload wrapper, parse the inner Package
      if (packageBytes != null && modules.isEmpty) {
        return parsePackageMessage(packageBytes)
      }

      modules.toSeq
    } catch {
      case ex: Exception =>
        logger.warn(s"Failed to parse Package payload: ${ex.getMessage}", ex)
        Seq.empty
    }
  }

  /**
   * Parse a raw Package protobuf message to extract module definitions.
   * This is called after unwrapping the ArchivePayload layer.
   *
   * Handles both Daml-LF 1.x (inline DottedName strings) and 2.x (interned names).
   *
   * Package structure:
   * {{{
   *   message Package {
   *     repeated Module modules = 1;
   *     // ... (fields 2-10 contain metadata)
   *     repeated string interned_strings = 11;
   *     repeated InternedDottedName interned_dotted_names = 12;
   *   }
   *   message InternedDottedName {
   *     repeated int32 segments_interned_str = 1;
   *   }
   * }}}
   */
  private def parsePackageMessage(packageBytes: Array[Byte]): Seq[ModuleDetail] = {
    if (packageBytes.isEmpty) return Seq.empty

    try {
      val input = com.google.protobuf.CodedInputStream.newInstance(packageBytes)
      input.setSizeLimit(packageBytes.length + 10)
      val rawModules = scala.collection.mutable.ArrayBuffer[Array[Byte]]()
      val internedStrings = scala.collection.mutable.ArrayBuffer[String]()
      val internedDottedNames = scala.collection.mutable.ArrayBuffer[Seq[Int]]()
      val seenFields = scala.collection.mutable.Map[Int, Int]().withDefaultValue(0)

      // In LF 2.x, the Package also contains flat definition arrays:
      // field 2: repeated DefTypeSyn, field 3: repeated DefDataType,
      // field 5: repeated DefTemplate, field 6: repeated DefInterface
      val rawTemplatesFlat = scala.collection.mutable.ArrayBuffer[Array[Byte]]()
      val rawInterfacesFlat = scala.collection.mutable.ArrayBuffer[Array[Byte]]()

      var done = false
      while (!done) {
        val tag = input.readTag()
        val fieldNum = tag >>> 3
        seenFields(fieldNum) += 1
        tag match {
          case 0 => done = true
          case 10 => // field 1: modules (repeated Module) — raw bytes, parse later
            rawModules += input.readByteArray()
          // LF 2.x flat definition arrays
          case 42 => // field 5: repeated DefTemplate (LF 2.x flat)
            rawTemplatesFlat += input.readByteArray()
          case 50 => // field 6: repeated DefInterface (LF 2.x flat)
            rawInterfacesFlat += input.readByteArray()
          // In Daml-LF 1.x Package, interned_strings = field 11, interned_dotted_names = field 12
          // In Daml-LF 2.x Package, interned_strings = field 7, interned_dotted_names = field 8
          case 58 => // field 7: interned_strings (LF 2.x)
            internedStrings += input.readString()
          case 66 => // field 8: interned_dotted_names (LF 2.x)
            val dnBytes = input.readByteArray()
            internedDottedNames += parseInternedDottedName(dnBytes)
          case 90 => // field 11: interned_strings (LF 1.x)
            internedStrings += input.readString()
          case 98 => // field 12: interned_dotted_names (LF 1.x)
            val dnBytes = input.readByteArray()
            internedDottedNames += parseInternedDottedName(dnBytes)
          case _ => input.skipField(tag)
        }
      }

      logger.debug(s"parsePackageMessage: fields seen = ${seenFields.toSeq.sortBy(_._1).map{case(k,v)=>s"$k:$v"}.mkString(", ")}")
      logger.debug(s"parsePackageMessage: ${internedStrings.size} interned strings, ${internedDottedNames.size} interned dotted names, ${rawTemplatesFlat.size} flat templates, ${rawInterfacesFlat.size} flat interfaces")
      if (internedStrings.nonEmpty) {
        logger.debug(s"parsePackageMessage: first 20 interned strings: ${internedStrings.take(20).zipWithIndex.map{case(s,i)=>s"$i:'$s'"}.mkString(", ")}")
      }

      // Build interning context
      val ctx = InterningContext(internedStrings.toSeq, internedDottedNames.toSeq)

      // Parse modules with interning context
      var modules = rawModules.flatMap(b => parseModuleMessage(b, ctx)).toSeq

      // In LF 2.x, templates may be at the Package level, not inside modules.
      // If modules have no templates but the Package does, build a synthetic module.
      if (modules.forall(_.templates.isEmpty) && rawTemplatesFlat.nonEmpty) {
        logger.info(s"LF 2.x: Parsing ${rawTemplatesFlat.size} Package-level template definitions")
        val flatTemplates = rawTemplatesFlat.flatMap(b => parseTemplateMessage(b, ctx)).toSeq
        val flatInterfaces = rawInterfacesFlat.flatMap(b => parseInterfaceMessage(b, ctx)).toSeq

        // Group templates by their module name (extracted from the qualified name)
        // In LF 2.x, template names are fully qualified, so we can extract the module prefix
        if (modules.nonEmpty) {
          // Assign all flat templates to the first non-empty module
          modules = modules.map { m =>
            if (m.templates.isEmpty) {
              m.copy(templates = flatTemplates, interfaces = flatInterfaces)
            } else m
          }
        } else {
          // Create a synthetic module
          modules = Seq(ModuleDetail(
            name = "<root>",
            templates = flatTemplates,
            interfaces = flatInterfaces,
            typeDefinitions = Seq.empty
          ))
        }
      }

      modules
    } catch {
      case ex: Exception =>
        logger.warn(s"Failed to parse Package message: ${ex.getMessage}")
        Seq.empty
    }
  }

  /** Interning context collected from a Package message. */
  private case class InterningContext(
    strings: Seq[String],
    dottedNames: Seq[Seq[Int]] // Each entry is a list of interned string indices
  ) {
    def resolveString(idx: Int): String =
      if (idx >= 0 && idx < strings.size) strings(idx) else s"<interned_str_$idx>"

    def resolveDottedName(idx: Int): String = {
      if (idx >= 0 && idx < dottedNames.size) {
        dottedNames(idx).map(resolveString).mkString(".")
      } else s"<interned_dn_$idx>"
    }
  }

  private val EmptyCtx = InterningContext(Seq.empty, Seq.empty)

  /** Parse an InternedDottedName message (repeated int32 segments). */
  private def parseInternedDottedName(bytes: Array[Byte]): Seq[Int] = {
    try {
      val input = com.google.protobuf.CodedInputStream.newInstance(bytes)
      val segments = scala.collection.mutable.ArrayBuffer[Int]()
      var done = false
      while (!done) {
        val tag = input.readTag()
        tag match {
          case 0 => done = true
          case 8 => // field 1: segments_interned_str (repeated int32)
            segments += input.readInt32()
          case 10 => // field 1, packed encoding
            val len = input.readRawVarint32()
            val limit = input.pushLimit(len)
            while (input.getBytesUntilLimit > 0) {
              segments += input.readInt32()
            }
            input.popLimit(limit)
          case _ => input.skipField(tag)
        }
      }
      segments.toSeq
    } catch {
      case _: Exception => Seq.empty
    }
  }

  private def parseModuleMessage(bytes: Array[Byte], ctx: InterningContext): Option[ModuleDetail] = {
    try {
      val input = com.google.protobuf.CodedInputStream.newInstance(bytes)
      var moduleName = ""
      val templates = scala.collection.mutable.ArrayBuffer[TemplateDefinition]()
      val typeDefinitions = scala.collection.mutable.ArrayBuffer[TypeDefinition]()
      val moduleFields = scala.collection.mutable.Map[Int, Int]().withDefaultValue(0)

      var done = false
      while (!done) {
        val tag = input.readTag()
        val fieldNum = tag >>> 3
        moduleFields(fieldNum) += 1
        tag match {
          case 0 => done = true
          case 10 => // field 1: name (DottedName, LF 1.x)
            val nameBytes = input.readByteArray()
            moduleName = parseDottedName(nameBytes)
          case 26 => // field 3: templates (repeated DefTemplate)
            val templateBytes = input.readByteArray()
            parseTemplateMessage(templateBytes, ctx).foreach(templates += _)
          case 34 => // field 4: data_types (repeated DefDataType)
            val dtBytes = input.readByteArray()
            parseDataTypeMessage(dtBytes, ctx).foreach(typeDefinitions += _)
          case 64 => // field 8: name_interned_dname (int32, LF 2.x)
            moduleName = ctx.resolveDottedName(input.readInt32())
          case _ => input.skipField(tag)
        }
      }

      logger.debug(s"parseModuleMessage: name='$moduleName', templates=${templates.size}, types=${typeDefinitions.size}, fields=${moduleFields.toSeq.sortBy(_._1).map{case(k,v)=>s"f$k=$v"}.mkString(", ")} (${bytes.length} bytes)")

      if (moduleName.isEmpty) None
      else Some(ModuleDetail(
        name = moduleName,
        templates = templates.toSeq,
        interfaces = Seq.empty,
        typeDefinitions = typeDefinitions.toSeq
      ))
    } catch {
      case ex: Exception =>
        logger.warn(s"Failed to parse Module message: ${ex.getMessage}")
        None
    }
  }

  private def parseTemplateMessage(bytes: Array[Byte], ctx: InterningContext): Option[TemplateDefinition] = {
    try {
      val input = com.google.protobuf.CodedInputStream.newInstance(bytes)
      var templateName = ""
      val fields = scala.collection.mutable.ArrayBuffer[FieldDefinition]()
      val choices = scala.collection.mutable.ArrayBuffer[ChoiceDefinition]()

      var done = false
      while (!done) {
        val tag = input.readTag()
        tag match {
          case 0 => done = true
          case 10 => // field 1: tycon (DottedName, LF 1.x)
            val nameBytes = input.readByteArray()
            templateName = parseDottedName(nameBytes)
          case 18 => // field 2: param (template parameter / record type)
            val paramBytes = input.readByteArray()
            parseRecordFields(paramBytes).foreach(fields ++= _)
          case 26 => // field 3: choices (repeated TemplateChoice)
            val choiceBytes = input.readByteArray()
            parseChoiceMessage(choiceBytes, ctx).foreach(choices += _)
          case 96 => // field 12: tycon_interned_dname (int32, LF 2.x)
            templateName = ctx.resolveDottedName(input.readInt32())
          case _ => input.skipField(tag)
        }
      }

      if (templateName.isEmpty) None
      else Some(TemplateDefinition(
        name = templateName,
        fields = fields.toSeq,
        choices = choices.toSeq,
        key = None,
        signatoryExpression = "<parsed from DALF>",
        observerExpression = "<parsed from DALF>",
        ensureExpression = None,
        implements = Seq.empty,
        sourceCode = None,
        decompiledLF = None
      ))
    } catch {
      case ex: Exception =>
        logger.warn(s"Failed to parse Template message: ${ex.getMessage}")
        None
    }
  }

  private def parseChoiceMessage(bytes: Array[Byte], ctx: InterningContext): Option[ChoiceDefinition] = {
    try {
      val input = com.google.protobuf.CodedInputStream.newInstance(bytes)
      var choiceName = ""
      var consuming = true
      var returnType = "Unit"

      var done = false
      while (!done) {
        val tag = input.readTag()
        tag match {
          case 0 => done = true
          case 10 => // field 1: name (string, LF 1.x)
            choiceName = input.readString()
          case 16 => // field 2: consuming
            consuming = input.readBool()
          case 34 => // field 4: return type
            val typeBytes = input.readByteArray()
            returnType = renderType(typeBytes)
          case 72 => // field 9: name_interned_str (int32, LF 2.x)
            choiceName = ctx.resolveString(input.readInt32())
          case _ => input.skipField(tag)
        }
      }

      if (choiceName.isEmpty) None
      else Some(ChoiceDefinition(
        name = choiceName,
        consuming = consuming,
        parameters = Seq.empty,
        returnType = returnType,
        controllerExpression = "<parsed from DALF>",
        sourceCode = None,
        decompiledLF = None
      ))
    } catch {
      case ex: Exception =>
        logger.warn(s"Failed to parse Choice message: ${ex.getMessage}")
        None
    }
  }

  private def parseDataTypeMessage(bytes: Array[Byte], ctx: InterningContext): Option[TypeDefinition] = {
    try {
      val input = com.google.protobuf.CodedInputStream.newInstance(bytes)
      var typeName = ""
      var serializable = false

      var done = false
      while (!done) {
        val tag = input.readTag()
        tag match {
          case 0 => done = true
          case 10 => // field 1: name (DottedName, LF 1.x)
            val nameBytes = input.readByteArray()
            typeName = parseDottedName(nameBytes)
          case 16 => // field 2: serializable
            serializable = input.readBool()
          case 96 => // field 12: name_interned_dname (int32, LF 2.x)
            typeName = ctx.resolveDottedName(input.readInt32())
          case _ => input.skipField(tag)
        }
      }

      if (typeName.isEmpty) None
      else Some(TypeDefinition(
        name = typeName,
        serializable = serializable,
        representation = "record"
      ))
    } catch {
      case ex: Exception =>
        logger.warn(s"Failed to parse DataType message: ${ex.getMessage}")
        None
    }
  }

  private def parseInterfaceMessage(bytes: Array[Byte], ctx: InterningContext): Option[InterfaceDefinition] = {
    try {
      val input = com.google.protobuf.CodedInputStream.newInstance(bytes)
      var ifaceName = ""
      val choices = scala.collection.mutable.ArrayBuffer[ChoiceDefinition]()

      var done = false
      while (!done) {
        val tag = input.readTag()
        tag match {
          case 0 => done = true
          case 10 => // field 1: tycon (DottedName, LF 1.x)
            val nameBytes = input.readByteArray()
            ifaceName = parseDottedName(nameBytes)
          case 26 => // field 3: choices
            val choiceBytes = input.readByteArray()
            parseChoiceMessage(choiceBytes, ctx).foreach(choices += _)
          case 48 => // field 6: tycon_interned_dname (int32, LF 2.x)
            ifaceName = ctx.resolveDottedName(input.readInt32())
          case _ => input.skipField(tag)
        }
      }

      if (ifaceName.isEmpty) None
      else Some(InterfaceDefinition(
        name = ifaceName,
        methods = Seq.empty,
        choices = choices.toSeq
      ))
    } catch {
      case ex: Exception =>
        logger.warn(s"Failed to parse Interface message: ${ex.getMessage}")
        None
    }
  }

  // -----------------------------------------------------------------------
  // Helper methods
  // -----------------------------------------------------------------------

  private def parseDottedName(bytes: Array[Byte]): String = {
    try {
      val input = com.google.protobuf.CodedInputStream.newInstance(bytes)
      val segments = scala.collection.mutable.ArrayBuffer[String]()

      var done = false
      while (!done) {
        val tag = input.readTag()
        tag match {
          case 0 => done = true
          case 10 => segments += input.readString() // field 1: segments (repeated)
          case _ => input.skipField(tag)
        }
      }

      segments.mkString(".")
    } catch {
      case _: Exception => "<unknown>"
    }
  }

  private def parseRecordFields(bytes: Array[Byte]): Option[Seq[FieldDefinition]] = {
    // Simplified: in the real implementation, we resolve the record type
    // reference and extract its fields. For now, return empty.
    // The full implementation needs the package's type environment to resolve references.
    None
  }

  private def renderType(bytes: Array[Byte]): String = {
    // Simplified type rendering — the full implementation walks the Daml-LF
    // Type AST to produce human-readable strings like "Optional Text",
    // "List (ContractId MyTemplate)", etc.
    try {
      val input = com.google.protobuf.CodedInputStream.newInstance(bytes)
      val tag = input.readTag()
      val fieldNumber = tag >>> 3
      fieldNumber match {
        case 1  => "Unit"
        case 2  => "Bool"
        case 3  => "Int64"
        case 4  => "Numeric"
        case 5  => "Text"
        case 6  => "Timestamp"
        case 7  => "Party"
        case 8  => "ContractId"
        case 11 => "List"
        case 12 => "Optional"
        case 13 => "Map"
        case _  => "<type>"
      }
    } catch {
      case _: Exception => "<type>"
    }
  }

  private def computePackageHash(payload: Array[Byte]): String = {
    val digest = java.security.MessageDigest.getInstance("SHA-256")
    val hashBytes = digest.digest(payload)
    hashBytes.map("%02x".format(_)).mkString
  }
}
