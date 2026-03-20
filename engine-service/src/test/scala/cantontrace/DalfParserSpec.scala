package cantontrace

import cantontrace.parser.{DalfParser, Decompiler, SourceExtractor}
import cantontrace.model._
import org.scalatest.flatspec.AnyFlatSpec
import org.scalatest.matchers.should.Matchers

import java.io.{ByteArrayOutputStream}
import java.util.Base64
import java.util.zip.{ZipEntry, ZipOutputStream}

/**
 * Unit tests for the DALF parser, source extractor, and decompiler.
 */
class DalfParserSpec extends AnyFlatSpec with Matchers {

  // -----------------------------------------------------------------------
  // DALF Parser
  // -----------------------------------------------------------------------

  "DalfParser" should "reject empty input" in {
    val result = DalfParser.parse("")
    // Empty base64 decodes to empty bytes, which should fail protobuf parsing
    result.isLeft shouldBe true
  }

  it should "reject invalid base64" in {
    val result = DalfParser.parse("not-valid-base64!@#$")
    result.isLeft shouldBe true
  }

  it should "reject random bytes that are not a valid DALF" in {
    val randomBytes = Array.fill(100)((scala.util.Random.nextInt(256) - 128).toByte)
    val base64 = Base64.getEncoder.encodeToString(randomBytes)
    val result = DalfParser.parse(base64)
    // Should either fail or return an empty package (no valid modules)
    result match {
      case Right(pkg) => pkg.modules shouldBe empty
      case Left(_) => // Expected
    }
  }

  it should "parse a minimal protobuf Archive envelope" in {
    // Construct a minimal valid Archive protobuf:
    // field 1 (hash_function): varint 0 (SHA256)
    // field 3 (payload): empty bytes
    // field 4 (hash): string "abc123"
    val baos = new ByteArrayOutputStream()
    val cos = com.google.protobuf.CodedOutputStream.newInstance(baos)
    cos.writeEnum(1, 0) // hash_function = SHA256
    cos.writeByteArray(3, Array.emptyByteArray) // empty payload
    cos.writeString(4, "abc123def456") // hash
    cos.flush()

    val base64 = Base64.getEncoder.encodeToString(baos.toByteArray)
    val result = DalfParser.parse(base64)

    result.isRight shouldBe true
    val pkg = result.toOption.get
    pkg.packageId shouldBe "abc123def456"
    pkg.modules shouldBe empty // no modules in empty payload
  }

  // -----------------------------------------------------------------------
  // Source Extractor
  // -----------------------------------------------------------------------

  "SourceExtractor" should "extract .daml files from a DAR (ZIP) archive" in {
    val darBytes = createTestDar(Map(
      "daml/Main.daml" -> "module Main where\n\ntemplate SimpleToken\n  with\n    owner : Party\n",
      "daml/Helper.daml" -> "module Helper where\n\nhelper : Int -> Int\nhelper x = x + 1\n"
    ))
    val base64 = Base64.getEncoder.encodeToString(darBytes)

    val result = SourceExtractor.extract(base64)
    result.isRight shouldBe true

    val response = result.toOption.get
    response.sources should have size 2
    // Paths should be normalized (stripped "daml/" prefix)
    response.sources should contain key "Main.daml"
    response.sources should contain key "Helper.daml"
    response.sources("Main.daml") should include("module Main where")
  }

  it should "handle DAR without source files" in {
    val darBytes = createTestDar(Map(
      "test-1.0.0.dalf" -> "binary-dalf-content"
    ))
    val base64 = Base64.getEncoder.encodeToString(darBytes)

    val result = SourceExtractor.extract(base64)
    result.isRight shouldBe true

    val response = result.toOption.get
    response.sources shouldBe empty
  }

  it should "parse MANIFEST.MF to find main DALF" in {
    val manifest =
      """Manifest-Version: 1.0
        |Created-By: daml-sdk
        |Main-Dalf: test-1.0.0.dalf
        |Dalfs: test-1.0.0.dalf, dep1.dalf
        |Sdk-Version: 2.9.0
        |""".stripMargin

    val darBytes = createTestDar(Map(
      "META-INF/MANIFEST.MF" -> manifest,
      "test-1.0.0.dalf" -> "dalf-bytes",
      "dep1.dalf" -> "dep-dalf-bytes",
      "daml/Main.daml" -> "module Main where"
    ))
    val base64 = Base64.getEncoder.encodeToString(darBytes)

    val result = SourceExtractor.extract(base64)
    result.isRight shouldBe true
    result.toOption.get.sources should have size 1
  }

  it should "reject invalid base64" in {
    val result = SourceExtractor.extract("not-valid-base64!@#$")
    result.isLeft shouldBe true
  }

  it should "handle empty DAR" in {
    val darBytes = createTestDar(Map.empty)
    val base64 = Base64.getEncoder.encodeToString(darBytes)

    val result = SourceExtractor.extract(base64)
    result.isRight shouldBe true
    result.toOption.get.sources shouldBe empty
  }

  it should "parse manifest DALF list" in {
    val manifest =
      """Manifest-Version: 1.0
        |Main-Dalf: main.dalf
        |Dalfs: main.dalf, dep1.dalf, dep2.dalf
        |""".stripMargin

    val dalfs = SourceExtractor.parseManifestDalfs(manifest)
    dalfs should contain theSameElementsAs Seq("main.dalf", "dep1.dalf", "dep2.dalf")
  }

  // -----------------------------------------------------------------------
  // Decompiler
  // -----------------------------------------------------------------------

  "Decompiler" should "decompile a PackageDetail into readable text" in {
    val pkg = PackageDetail(
      packageId = "abc123",
      packageName = Some("test-package"),
      packageVersion = Some("1.0.0"),
      modules = Seq(
        ModuleDetail(
          name = "Main",
          templates = Seq(
            TemplateDefinition(
              name = "SimpleToken",
              fields = Seq(
                FieldDefinition("owner", "Party", optional = false),
                FieldDefinition("amount", "Numeric 10", optional = false),
                FieldDefinition("description", "Text", optional = true)
              ),
              choices = Seq(
                ChoiceDefinition(
                  name = "Transfer",
                  consuming = true,
                  parameters = Seq(FieldDefinition("newOwner", "Party", optional = false)),
                  returnType = "ContractId SimpleToken",
                  controllerExpression = "owner",
                  sourceCode = None,
                  decompiledLF = Some("create SimpleToken with owner = newOwner, amount = this.amount")
                )
              ),
              key = Some(KeyDefinition(
                keyType = "(Party, Text)",
                expression = "(owner, description)",
                maintainerExpression = "key._1"
              )),
              signatoryExpression = "owner",
              observerExpression = "owner",
              ensureExpression = Some("amount > 0"),
              implements = Seq.empty,
              sourceCode = None,
              decompiledLF = None
            )
          ),
          interfaces = Seq.empty,
          typeDefinitions = Seq.empty
        )
      ),
      hasSource = false
    )

    val result = Decompiler.decompilePackage(pkg)
    result should have size 1
    result should contain key "Main.daml"

    val source = result("Main.daml")
    source should include("-- Decompiled from Daml-LF")
    source should include("-- Package: abc123")
    source should include("module Main where")
    source should include("template SimpleToken")
    source should include("owner : Party")
    source should include("amount : Numeric 10")
    source should include("Optional Text") // optional field
    source should include("signatory owner")
    source should include("ensure amount > 0")
    source should include("choice Transfer : ContractId SimpleToken")
    source should include("controller owner")
    source should include("key (owner, description) : (Party, Text)")
    source should include("maintainer key._1")
  }

  it should "decompile expressions correctly" in {
    Decompiler.decompileExpression("var", Map("name" -> "x")) shouldBe "x"
    Decompiler.decompileExpression("app", Map("function" -> "f", "argument" -> "x")) shouldBe "f x"
    Decompiler.decompileExpression("rec_proj", Map("record" -> "this", "field" -> "amount")) shouldBe "this.amount"
    Decompiler.decompileExpression("create", Map("template" -> "Token", "args" -> "...")) shouldBe "create Token with ..."
    Decompiler.decompileExpression("none", Map.empty) shouldBe "None"
    Decompiler.decompileExpression("some", Map("value" -> "42")) shouldBe "Some 42"
    Decompiler.decompileExpression("nil", Map.empty) shouldBe "[]"
  }

  it should "handle empty package" in {
    val pkg = PackageDetail("empty", None, None, Seq.empty, hasSource = false)
    val result = Decompiler.decompilePackage(pkg)
    result shouldBe empty
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  /** Create a minimal ZIP archive simulating a DAR file. */
  private def createTestDar(entries: Map[String, String]): Array[Byte] = {
    val baos = new ByteArrayOutputStream()
    val zos = new ZipOutputStream(baos)

    for ((name, content) <- entries) {
      zos.putNextEntry(new ZipEntry(name))
      zos.write(content.getBytes("UTF-8"))
      zos.closeEntry()
    }

    zos.close()
    baos.toByteArray
  }
}
