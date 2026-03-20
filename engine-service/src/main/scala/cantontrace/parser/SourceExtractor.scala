package cantontrace.parser

import cantontrace.model.ExtractSourceResponse
import com.typesafe.scalalogging.LazyLogging

import java.io.{ByteArrayInputStream, ByteArrayOutputStream}
import java.util.Base64
import java.util.zip.{ZipEntry, ZipInputStream}
import scala.collection.mutable
import scala.util.{Failure, Success, Try}

/**
 * Extracts `.daml` source files from DAR (Daml Archive) packages.
 *
 * A DAR file is a standard ZIP archive with the following layout:
 *   META-INF/MANIFEST.MF          - DAR manifest with Main-Dalf, Dalfs, Sdk-Version
 *   main-dalf-path.dalf           - the main DALF archive
 *   dependency-dalf-paths.dalf    - dependency DALF archives
 *   source-path/sources.daml      - optional Daml source files
 *
 * The MANIFEST.MF file maps DALF paths to their roles. We extract:
 *   1. The MANIFEST.MF to determine the main package and its dependencies.
 *   2. All `.daml` source files for the code panel.
 *   3. The main DALF to compute the package ID.
 *
 * When source files are present, the Execution Trace can show actual Daml
 * source with line-level highlighting (Tier 1). When absent, the frontend
 * falls back to decompiled Daml-LF representation (Tier 2).
 */
object SourceExtractor extends LazyLogging {

  /** Maximum uncompressed size we'll accept for a single entry (50 MB). */
  private val MaxEntrySize: Long = 50L * 1024 * 1024

  /** Maximum total uncompressed size across all entries (200 MB). */
  private val MaxTotalSize: Long = 200L * 1024 * 1024

  /** Maximum size for a base64-encoded DAR input (200 MB of base64 ~ 150 MB decoded). */
  private val MaxBase64InputLength: Int = 200 * 1024 * 1024

  /**
   * Extract source files from a base64-encoded DAR archive.
   *
   * @param darBase64 the DAR file bytes encoded as a base64 string
   * @return the extracted sources, or an error description
   */
  def extract(darBase64: String): Either[String, ExtractSourceResponse] = {
    if (darBase64.length > MaxBase64InputLength) {
      return Left(s"DAR input too large: ${darBase64.length} base64 characters exceeds limit of $MaxBase64InputLength")
    }
    Try {
      val bytes = Base64.getDecoder.decode(darBase64)
      extractFromBytes(bytes)
    } match {
      case Success(result) => result
      case Failure(ex) =>
        logger.error(s"Failed to decode DAR base64: ${ex.getMessage}", ex)
        Left(s"Failed to decode DAR bytes: ${ex.getMessage}")
    }
  }

  /**
   * Extract source files from raw DAR bytes.
   */
  def extractFromBytes(bytes: Array[Byte]): Either[String, ExtractSourceResponse] = {
    Try {
      val zis = new ZipInputStream(new ByteArrayInputStream(bytes))
      try {
        extractFromZip(zis)
      } finally {
        zis.close()
      }
    } match {
      case Success(result) => result
      case Failure(ex) =>
        logger.error(s"Failed to read DAR as ZIP: ${ex.getMessage}", ex)
        Left(s"Invalid DAR archive: ${ex.getMessage}")
    }
  }

  // -----------------------------------------------------------------------
  // Internal extraction
  // -----------------------------------------------------------------------

  private def extractFromZip(zis: ZipInputStream): Either[String, ExtractSourceResponse] = {
    val sources = mutable.LinkedHashMap[String, String]()
    var manifest: Option[String] = None
    var mainDalfBytes: Option[Array[Byte]] = None
    var mainDalfPath: Option[String] = None
    var totalSize = 0L

    var entry: ZipEntry = zis.getNextEntry
    while (entry != null) {
      val name = entry.getName

      // Guard against ZIP path traversal attacks (e.g., "../../etc/passwd")
      val normalized = java.nio.file.Paths.get(name).normalize().toString
      if (normalized.startsWith("..") || normalized.startsWith("/")) {
        logger.warn(s"Skipping entry with path traversal: $name")
      } else if (!entry.isDirectory) {
        val entrySize = if (entry.getSize >= 0) entry.getSize else MaxEntrySize
        if (entrySize > MaxEntrySize) {
          logger.warn(s"Skipping oversized entry: $name (${entrySize} bytes)")
        } else if (totalSize + entrySize > MaxTotalSize) {
          logger.warn(s"Stopping extraction: total size limit reached at $name")
          return Left("DAR archive too large: exceeds 200 MB uncompressed limit")
        } else {
          val remainingBudget = MaxTotalSize - totalSize
          val entryLimit = math.min(MaxEntrySize, remainingBudget).toLong
          val content = readEntry(zis, entryLimit)
          totalSize += content.length

          name match {
            case "META-INF/MANIFEST.MF" =>
              manifest = Some(new String(content, "UTF-8"))
              logger.debug("Found MANIFEST.MF")

            case p if p.endsWith(".daml") =>
              // Normalize the path: strip leading directories like "daml-src/" or "src/"
              val normalizedPath = normalizeDamlPath(p)
              val sourceContent = new String(content, "UTF-8")
              sources(normalizedPath) = sourceContent
              logger.debug(s"Extracted source: $normalizedPath (${content.length} bytes)")

            case p if p.endsWith(".dalf") =>
              // We may need the DALF to compute the package ID
              if (mainDalfBytes.isEmpty) {
                mainDalfBytes = Some(content)
                mainDalfPath = Some(p)
              }

            case _ =>
              // Skip other files (e.g., .hi, .hie, .o)
              logger.trace(s"Skipping entry: $name")
          }
        }
      }

      zis.closeEntry()
      entry = zis.getNextEntry
    }

    // Parse the manifest to find the main DALF path and package ID
    val packageId = manifest.flatMap(parseManifestForMainDalf) match {
      case Some(mainPath) =>
        logger.info(s"Main DALF from manifest: $mainPath")
        // Compute package ID from the main DALF bytes
        mainDalfBytes.map(computePackageId)
      case None =>
        logger.info("No manifest or Main-Dalf not found, using first DALF")
        mainDalfBytes.map(computePackageId)
    }

    logger.info(
      s"DAR extraction complete: packageId=${packageId.getOrElse("unknown")}, " +
      s"sources=${sources.size}, totalSize=${totalSize} bytes"
    )

    Right(ExtractSourceResponse(
      packageId = packageId,
      sources = sources.toMap
    ))
  }

  /**
   * Parse the MANIFEST.MF content to find the Main-Dalf entry.
   *
   * Example manifest:
   * {{{
   *   Manifest-Version: 1.0
   *   Created-By: daml-sdk
   *   Main-Dalf: my-package-1.0.0.dalf
   *   Dalfs: my-package-1.0.0.dalf, dep1.dalf, dep2.dalf
   *   Format: daml-lf
   *   Encryption: non-encrypted
   *   Sdk-Version: 2.9.0
   * }}}
   */
  private def parseManifestForMainDalf(manifest: String): Option[String] = {
    // Manifest lines can be continued with a leading space
    val unfolded = unfoldManifest(manifest)
    unfolded.linesIterator
      .map(_.trim)
      .find(_.startsWith("Main-Dalf:"))
      .map(_.stripPrefix("Main-Dalf:").trim)
  }

  /**
   * Parse all DALF paths from the manifest.
   */
  def parseManifestDalfs(manifest: String): Seq[String] = {
    val unfolded = unfoldManifest(manifest)
    unfolded.linesIterator
      .map(_.trim)
      .find(_.startsWith("Dalfs:"))
      .map(_.stripPrefix("Dalfs:").trim)
      .map(_.split(",").map(_.trim).toSeq.filter(_.nonEmpty))
      .getOrElse(Seq.empty)
  }

  /**
   * Unfold manifest continuation lines (lines starting with a single space
   * are continuations of the previous line).
   */
  private def unfoldManifest(manifest: String): String = {
    val lines = manifest.linesIterator.toSeq
    val sb = new StringBuilder
    for (line <- lines) {
      if (line.startsWith(" ")) {
        // Continuation line — append without the leading space
        sb.append(line.substring(1))
      } else {
        if (sb.nonEmpty) sb.append('\n')
        sb.append(line)
      }
    }
    sb.toString()
  }

  /**
   * Normalize a .daml source file path by stripping common prefixes.
   *
   * DAR archives may nest source files under various prefixes:
   *   - `daml/Module.daml`
   *   - `src/Module.daml`
   *   - `daml-src/Module.daml`
   *   - `My.Package/Module.daml`
   *
   * We strip the first path component if it looks like a container directory.
   */
  private def normalizeDamlPath(path: String): String = {
    val segments = path.split("/").toSeq
    if (segments.size > 1) {
      val firstSegment = segments.head.toLowerCase
      val commonPrefixes = Set("daml", "src", "daml-src", "source", "sources", "lib")
      if (commonPrefixes.contains(firstSegment)) {
        segments.drop(1).mkString("/")
      } else {
        path
      }
    } else {
      path
    }
  }

  /**
   * Compute the package ID from DALF bytes.
   *
   * The package ID is the SHA-256 hash of the DALF payload (the inner
   * Package protobuf, not the outer Archive wrapper). However, for
   * simplicity we hash the entire DALF here — the archive reader will
   * provide the correct hash when available.
   */
  private def computePackageId(dalfBytes: Array[Byte]): String = {
    try {
      // Try to extract the hash from the Archive protobuf envelope
      val input = com.google.protobuf.CodedInputStream.newInstance(dalfBytes)
      var hash = ""
      var done = false
      while (!done) {
        val tag = input.readTag()
        tag match {
          case 0  => done = true
          case 34 => hash = input.readString() // field 4: hash
          case _  => input.skipField(tag)
        }
      }
      if (hash.nonEmpty) hash
      else {
        // Fallback: hash the entire bytes
        val digest = java.security.MessageDigest.getInstance("SHA-256")
        digest.digest(dalfBytes).map("%02x".format(_)).mkString
      }
    } catch {
      case _: Exception =>
        val digest = java.security.MessageDigest.getInstance("SHA-256")
        digest.digest(dalfBytes).map("%02x".format(_)).mkString
    }
  }

  /**
   * Read bytes from the current ZIP entry, enforcing a maximum size.
   *
   * This prevents ZIP bomb attacks where the declared size is small or
   * unknown (-1) but the actual uncompressed content is enormous.
   *
   * @param zis the ZIP input stream positioned at the current entry
   * @param maxBytes maximum number of bytes to read before aborting
   * @throws IllegalStateException if the entry exceeds maxBytes
   */
  private def readEntry(zis: ZipInputStream, maxBytes: Long): Array[Byte] = {
    val bos = new ByteArrayOutputStream(8192)
    val buffer = new Array[Byte](8192)
    var totalRead = 0L
    var bytesRead = 0
    while ({ bytesRead = zis.read(buffer); bytesRead != -1 }) {
      totalRead += bytesRead
      if (totalRead > maxBytes) {
        throw new IllegalStateException(
          s"ZIP entry exceeds maximum allowed size of $maxBytes bytes (read $totalRead so far)"
        )
      }
      bos.write(buffer, 0, bytesRead)
    }
    bos.toByteArray
  }
}
