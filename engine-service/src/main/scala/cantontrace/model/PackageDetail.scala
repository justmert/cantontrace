package cantontrace.model

/**
 * Parsed metadata extracted from a DALF archive.
 *
 * This is the response model for the `/parse-dalf` endpoint. The
 * frontend's Template Explorer renders this data as interactive
 * documentation for deployed Daml packages.
 */
final case class PackageDetail(
  packageId: String,
  packageName: Option[String],
  packageVersion: Option[String],
  modules: Seq[ModuleDetail],
  hasSource: Boolean
)

final case class ModuleDetail(
  name: String,
  templates: Seq[TemplateDefinition],
  interfaces: Seq[InterfaceDefinition],
  typeDefinitions: Seq[TypeDefinition]
)

final case class TemplateDefinition(
  name: String,
  fields: Seq[FieldDefinition],
  choices: Seq[ChoiceDefinition],
  key: Option[KeyDefinition],
  signatoryExpression: String,
  observerExpression: String,
  ensureExpression: Option[String],
  implements: Seq[String],
  sourceCode: Option[String],
  decompiledLF: Option[String]
)

final case class FieldDefinition(
  name: String,
  fieldType: String,
  optional: Boolean
)

final case class ChoiceDefinition(
  name: String,
  consuming: Boolean,
  parameters: Seq[FieldDefinition],
  returnType: String,
  controllerExpression: String,
  sourceCode: Option[String],
  decompiledLF: Option[String]
)

final case class KeyDefinition(
  keyType: String,
  expression: String,
  maintainerExpression: String
)

final case class InterfaceDefinition(
  name: String,
  methods: Seq[FieldDefinition],
  choices: Seq[ChoiceDefinition]
)

final case class TypeDefinition(
  name: String,
  serializable: Boolean,
  representation: String
)
