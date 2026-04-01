package cantontrace.parser

import cantontrace.model._
import com.typesafe.scalalogging.LazyLogging

import java.util.Base64
import scala.collection.mutable
import scala.util.{Failure, Success, Try}

/**
 * Decompiles Daml-LF bytecode into human-readable representation.
 *
 * When `.daml` source files are NOT available in the DAR archive, this
 * decompiler reads the Daml-LF AST and reconstructs a readable view
 * of the package's contents. This is "Tier 2" rendering — it produces
 * a structured, readable representation of the LF, not actual Daml
 * syntax.
 *
 * The output format is designed to be:
 *   - Readable by developers familiar with Daml
 *   - Renderable in Monaco Editor with reasonable syntax highlighting
 *   - Mappable to Daml-LF Location metadata for trace stepping
 *
 * Example output:
 * {{{
 *   -- Decompiled from Daml-LF (source not available)
 *   -- Package: abc123...
 *
 *   module Main where
 *
 *   template SimpleToken
 *     with
 *       owner : Party
 *       amount : Numeric 10
 *       description : Text
 *     where
 *       signatory owner
 *       observer owner
 *       ensure amount > 0
 *
 *       choice Transfer : ContractId SimpleToken
 *         with
 *           newOwner : Party
 *         controller owner
 *         do
 *           -- <exercise body: creates SimpleToken with newOwner>
 *           create SimpleToken with
 *             owner = newOwner
 *             amount = this.amount
 *             description = this.description
 *
 *       choice Split : (ContractId SimpleToken, ContractId SimpleToken)
 *         with
 *           splitAmount : Numeric 10
 *         controller owner
 *         do
 *           -- <exercise body: creates two SimpleToken contracts>
 *           assert (splitAmount > 0 && splitAmount < this.amount)
 *           ...
 * }}}
 */
object Decompiler extends LazyLogging {

  /**
   * Decompile a base64-encoded DALF into human-readable Daml-LF representation.
   *
   * @param dalfBase64 the DALF bytes encoded as base64
   * @return map of module name to decompiled source, or an error
   */
  def decompile(dalfBase64: String): Either[String, Map[String, String]] = {
    DalfParser.parse(dalfBase64) match {
      case Right(pkg) => Right(decompilePackage(pkg))
      case Left(err) => Left(s"Cannot decompile: $err")
    }
  }

  /**
   * Decompile raw DALF bytes.
   */
  def decompileBytes(bytes: Array[Byte]): Either[String, Map[String, String]] = {
    DalfParser.parseBytes(bytes) match {
      case Right(pkg) => Right(decompilePackage(pkg))
      case Left(err) => Left(s"Cannot decompile: $err")
    }
  }

  /**
   * Decompile a parsed [[PackageDetail]] into human-readable source.
   *
   * @return map of module name to decompiled content
   */
  def decompilePackage(pkg: PackageDetail): Map[String, String] = {
    val result = mutable.LinkedHashMap[String, String]()

    for (module <- pkg.modules) {
      val content = decompileModule(pkg.packageId, module)
      if (content.nonEmpty) {
        val filename = s"${module.name.replace('.', '/')}.daml"
        result(filename) = content
      }
    }

    if (result.isEmpty) {
      logger.info(s"Package ${pkg.packageId} has no decompilable content")
    } else {
      logger.info(
        s"Decompiled package ${pkg.packageId}: ${result.size} modules, " +
        s"${result.values.map(_.length).sum} characters total"
      )
    }

    result.toMap
  }

  // -----------------------------------------------------------------------
  // Module-level decompilation
  // -----------------------------------------------------------------------

  private def decompileModule(packageId: String, module: ModuleDetail): String = {
    val sb = new StringBuilder

    // Header
    sb.append(s"-- Decompiled from Daml-LF (source not available)\n")
    sb.append(s"-- Package: $packageId\n")
    sb.append(s"-- Module: ${module.name}\n")
    sb.append('\n')
    sb.append(s"module ${module.name} where\n")
    sb.append('\n')

    // Type definitions (data types, enums)
    for (typeDef <- module.typeDefinitions) {
      sb.append(decompileTypeDef(typeDef))
      sb.append('\n')
    }

    // Templates
    for (template <- module.templates) {
      sb.append(decompileTemplate(template))
      sb.append('\n')
    }

    // Interfaces
    for (interface <- module.interfaces) {
      sb.append(decompileInterface(interface))
      sb.append('\n')
    }

    sb.toString()
  }

  // -----------------------------------------------------------------------
  // Template decompilation
  // -----------------------------------------------------------------------

  private def decompileTemplate(template: TemplateDefinition): String = {
    val sb = new StringBuilder
    val indent = "  "

    sb.append(s"template ${template.name}\n")

    // Fields
    if (template.fields.nonEmpty) {
      sb.append(s"${indent}with\n")
      for (field <- template.fields) {
        val optionalPrefix = if (field.optional) "Optional " else ""
        sb.append(s"$indent$indent${field.name} : $optionalPrefix${field.fieldType}\n")
      }
    }

    sb.append(s"${indent}where\n")

    // Signatory/observer
    sb.append(s"$indent${indent}signatory ${template.signatoryExpression}\n")
    sb.append(s"$indent${indent}observer ${template.observerExpression}\n")

    // Ensure clause
    template.ensureExpression.foreach { ensure =>
      sb.append(s"$indent${indent}ensure $ensure\n")
    }

    // Key
    template.key.foreach { key =>
      sb.append('\n')
      sb.append(s"$indent${indent}key ${key.expression} : ${key.keyType}\n")
      sb.append(s"$indent${indent}maintainer ${key.maintainerExpression}\n")
    }

    // Implements
    for (iface <- template.implements) {
      sb.append(s"\n$indent${indent}implements $iface\n")
    }

    // Choices
    for (choice <- template.choices) {
      sb.append('\n')
      sb.append(decompileChoice(choice, indent + indent))
    }

    sb.toString()
  }

  private def decompileChoice(choice: ChoiceDefinition, baseIndent: String): String = {
    val sb = new StringBuilder
    val indent = baseIndent + "  "

    val consumingLabel = if (choice.consuming) "" else "nonconsuming "
    sb.append(s"${baseIndent}${consumingLabel}choice ${choice.name} : ${choice.returnType}\n")

    // Parameters
    if (choice.parameters.nonEmpty) {
      sb.append(s"${indent}with\n")
      for (param <- choice.parameters) {
        val optionalPrefix = if (param.optional) "Optional " else ""
        sb.append(s"$indent  ${param.name} : $optionalPrefix${param.fieldType}\n")
      }
    }

    // Controller
    sb.append(s"${indent}controller ${cleanControllerExpression(choice.controllerExpression)}\n")

    // Body
    sb.append(s"${indent}do\n")

    // If we have decompiled LF for the choice body, include it
    choice.decompiledLF match {
      case Some(body) =>
        body.linesIterator.foreach { line =>
          sb.append(s"$indent  $line\n")
        }
      case None =>
        sb.append(s"$indent  -- <choice body not available>\n")
    }

    sb.toString()
  }

  // -----------------------------------------------------------------------
  // Interface decompilation
  // -----------------------------------------------------------------------

  private def decompileInterface(interface: InterfaceDefinition): String = {
    val sb = new StringBuilder
    val indent = "  "

    sb.append(s"interface ${interface.name} where\n")

    // Methods
    for (method <- interface.methods) {
      val optionalPrefix = if (method.optional) "Optional " else ""
      sb.append(s"$indent${method.name} : $optionalPrefix${method.fieldType}\n")
    }

    // Choices
    for (choice <- interface.choices) {
      sb.append('\n')
      sb.append(decompileChoice(choice, indent))
    }

    sb.toString()
  }

  // -----------------------------------------------------------------------
  // Type definition decompilation
  // -----------------------------------------------------------------------

  private def decompileTypeDef(typeDef: TypeDefinition): String = {
    val sb = new StringBuilder

    typeDef.representation match {
      case "record" =>
        sb.append(s"data ${typeDef.name} = ${typeDef.name}\n")
        if (typeDef.fields.nonEmpty) {
          sb.append(s"  { ${typeDef.fields.head.name} : ${renderFieldType(typeDef.fields.head)}\n")
          for (field <- typeDef.fields.tail) {
            sb.append(s"  , ${field.name} : ${renderFieldType(field)}\n")
          }
          sb.append(s"  }\n")
        }
        if (typeDef.serializable) {
          sb.append(s"  deriving (Eq, Show)\n")
        }

      case "variant" =>
        sb.append(s"data ${typeDef.name}\n")
        if (typeDef.constructors.nonEmpty) {
          sb.append(s"  = ${typeDef.constructors.head}\n")
          for (ctor <- typeDef.constructors.tail) {
            sb.append(s"  | $ctor\n")
          }
        }
        if (typeDef.serializable) {
          sb.append(s"  deriving (Eq, Show)\n")
        }

      case "enum" =>
        sb.append(s"data ${typeDef.name}\n")
        if (typeDef.constructors.nonEmpty) {
          sb.append(s"  = ${typeDef.constructors.head}\n")
          for (ctor <- typeDef.constructors.tail) {
            sb.append(s"  | $ctor\n")
          }
        }
        if (typeDef.serializable) {
          sb.append(s"  deriving (Eq, Show, Enum)\n")
        }

      case other =>
        sb.append(s"-- type ${typeDef.name} = <$other>\n")
    }

    sb.toString()
  }

  /** Render a field type, prepending "Optional" if flagged. */
  private def renderFieldType(field: FieldDefinition): String = {
    if (field.optional) s"Optional ${field.fieldType}" else field.fieldType
  }

  // -----------------------------------------------------------------------
  // Controller expression cleanup
  // -----------------------------------------------------------------------

  /**
   * Clean up a controller expression for display. If the DalfParser
   * couldn't fully resolve a compiler-generated name, this applies
   * heuristic transformations:
   *
   *   - Simple field projections like "this.owner" become "owner"
   *   - Compiler-generated names (`$$sc_*`, `$$c*`) fall back to "<controller>"
   *   - "signatory" is preserved as-is
   */
  private def cleanControllerExpression(expr: String): String = {
    val trimmed = expr.trim

    // If it's a simple field name with no spaces or special chars, use it directly
    if (trimmed.nonEmpty && !trimmed.contains("$$") && !trimmed.contains("<")) {
      return trimmed
    }

    // If it contains compiler-generated names, try to extract something useful
    if (trimmed.contains("$$")) {
      // Try to find a field projection pattern like "this.fieldName" embedded in the expression
      val fieldProjPattern = """(?:this|arg)\.([\w]+)""".r
      val fields = fieldProjPattern.findAllMatchIn(trimmed).map(_.group(1)).toSeq.distinct
      if (fields.nonEmpty) return fields.mkString(", ")

      // Otherwise, fall back to a clean placeholder
      return "<controller>"
    }

    trimmed
  }

  // -----------------------------------------------------------------------
  // Expression decompilation (for choice bodies and ensure clauses)
  // -----------------------------------------------------------------------

  /**
   * Decompile a Daml-LF expression AST into a human-readable string.
   *
   * This is used for choice bodies, ensure clauses, signatory/observer
   * expressions, and key expressions. The output uses Daml-like syntax
   * where possible:
   *
   *   - Function application: `f x y`
   *   - Let bindings: `let x = expr in body`
   *   - Case/match: `case expr of { ... }`
   *   - Record construction: `Template with field1 = val1, field2 = val2`
   *   - Create/exercise: `create Template with ...` / `exercise cid Choice with ...`
   *   - Comparisons: `x > y`, `x == y`
   *   - Logical: `x && y`, `x || y`, `not x`
   *
   * Unsupported or complex expressions are rendered as `<expr-type>`.
   */
  def decompileExpression(expressionType: String, subExpressions: Map[String, String]): String = {
    expressionType match {
      case "var" =>
        subExpressions.getOrElse("name", "<var>")

      case "val" =>
        subExpressions.getOrElse("name", "<val>")

      case "builtin" =>
        val function = subExpressions.getOrElse("function", "<builtin>")
        val args = subExpressions.get("args").map(a => s" $a").getOrElse("")
        s"$function$args"

      case "rec_con" =>
        val tycon = subExpressions.getOrElse("tycon", "<Record>")
        val fields = subExpressions.get("fields").getOrElse("...")
        s"$tycon with $fields"

      case "rec_proj" =>
        val record = subExpressions.getOrElse("record", "<record>")
        val field = subExpressions.getOrElse("field", "<field>")
        s"$record.$field"

      case "app" =>
        val function = subExpressions.getOrElse("function", "<fn>")
        val argument = subExpressions.getOrElse("argument", "<arg>")
        s"$function $argument"

      case "abs" =>
        val param = subExpressions.getOrElse("param", "_")
        val body = subExpressions.getOrElse("body", "<body>")
        s"\\$param -> $body"

      case "let" =>
        val binding = subExpressions.getOrElse("binding", "<binding>")
        val value = subExpressions.getOrElse("value", "<value>")
        val body = subExpressions.getOrElse("body", "<body>")
        s"let $binding = $value in $body"

      case "case" =>
        val scrutinee = subExpressions.getOrElse("scrutinee", "<expr>")
        val alts = subExpressions.getOrElse("alternatives", "...")
        s"case $scrutinee of { $alts }"

      case "create" =>
        val template = subExpressions.getOrElse("template", "<Template>")
        val args = subExpressions.getOrElse("args", "...")
        s"create $template with $args"

      case "exercise" =>
        val template = subExpressions.getOrElse("template", "<Template>")
        val choice = subExpressions.getOrElse("choice", "<Choice>")
        val cid = subExpressions.getOrElse("contractId", "<cid>")
        val args = subExpressions.getOrElse("args", "...")
        s"exercise @$template $choice $cid with $args"

      case "fetch" =>
        val template = subExpressions.getOrElse("template", "<Template>")
        val cid = subExpressions.getOrElse("contractId", "<cid>")
        s"fetch @$template $cid"

      case "pure" =>
        val value = subExpressions.getOrElse("value", "()")
        s"pure $value"

      case "bind" =>
        val binding = subExpressions.getOrElse("binding", "_")
        val rhs = subExpressions.getOrElse("rhs", "<action>")
        val body = subExpressions.getOrElse("body", "<body>")
        s"$binding <- $rhs; $body"

      case "nil" => "[]"
      case "cons" =>
        val head = subExpressions.getOrElse("head", "<head>")
        val tail = subExpressions.getOrElse("tail", "[]")
        s"$head :: $tail"

      case "none" => "None"
      case "some" =>
        val value = subExpressions.getOrElse("value", "<value>")
        s"Some $value"

      case "to_text" =>
        val value = subExpressions.getOrElse("value", "<value>")
        s"show $value"

      case _ =>
        s"<$expressionType>"
    }
  }

  // -----------------------------------------------------------------------
  // Location mapping
  // -----------------------------------------------------------------------

  /**
   * Build a mapping from Daml-LF source locations to positions in the
   * decompiled output.
   *
   * The Daml-LF AST includes Location metadata that points to the original
   * `.daml` source file. When we decompile, we produce new positions.
   * This mapping allows the Execution Trace to highlight the correct
   * line in the decompiled view when stepping through.
   *
   * @param packageId     the package ID
   * @param decompiledSources map of module name to decompiled content
   * @return map of original SourceLocation to decompiled SourceLocation
   */
  def buildLocationMapping(
    packageId: String,
    decompiledSources: Map[String, String]
  ): Map[SourceLocation, SourceLocation] = {
    // In the full implementation, we walk the Daml-LF AST alongside the
    // decompiled output, recording the position in the decompiled text
    // that corresponds to each original Location in the AST.
    //
    // For now, this returns an empty map. The mapping will be populated
    // when the full AST walker is integrated with the decompiler output
    // generator.
    logger.debug(
      s"Building location mapping for package $packageId " +
      s"(${decompiledSources.size} modules)"
    )
    Map.empty
  }
}
