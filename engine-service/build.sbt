name := "cantontrace-engine"
version := "0.1.0"
scalaVersion := "2.13.12"

// Daml SDK repository (packages may not be on Maven Central)
resolvers ++= Seq(
  "Daml Maven" at "https://digital-asset.github.io/daml/maven",
  Resolver.mavenLocal
)

libraryDependencies ++= Seq(
  // Daml LF Engine (Apache 2.0) — Canton 3.4.11 release on Maven Central
  "com.daml" %% "daml-lf-engine"         % "3.4.11",
  "com.daml" %% "daml-lf-archive-reader" % "3.4.11",
  "com.daml" %% "daml-lf-data"           % "3.4.11",
  "com.daml" %% "daml-lf-language"       % "3.4.11",
  "com.daml" %% "daml-lf-transaction"    % "3.4.11",

  // HTTP server — Akka HTTP for the internal API surface
  "com.typesafe.akka" %% "akka-http"            % "10.5.3",
  "com.typesafe.akka" %% "akka-stream"          % "2.8.5",
  "com.typesafe.akka" %% "akka-actor-typed"     % "2.8.5",

  // JSON serialization
  "io.spray"          %% "spray-json"            % "1.3.6",
  "com.typesafe.akka" %% "akka-http-spray-json"  % "10.5.3",

  // Protobuf (for DALF parsing when archive-reader is insufficient)
  "com.google.protobuf" % "protobuf-java" % "3.25.1",

  // Logging
  "ch.qos.logback"              % "logback-classic" % "1.4.14",
  "com.typesafe.scala-logging" %% "scala-logging"   % "3.9.5",

  // Configuration
  "com.typesafe" % "config" % "1.4.3",

  // Testing
  "org.scalatest"     %% "scalatest"       % "3.2.17" % Test,
  "com.typesafe.akka" %% "akka-http-testkit" % "10.5.3" % Test,
  "com.typesafe.akka" %% "akka-stream-testkit" % "2.8.5" % Test,
)

// Fork the JVM so Akka HTTP's server stays alive during sbt run
Compile / run / fork := true
run / connectInput := true

// Java 17+ required by modern Daml SDK
javacOptions ++= Seq("-source", "17", "-target", "17")
scalacOptions ++= Seq(
  "-deprecation",
  "-feature",
  "-unchecked",
  "-Xlint:adapted-args",
  "-Xlint:constant",
  "-Xlint:delayedinit-select",
  "-Xlint:doc-detached",
  "-Xlint:inaccessible",
  "-Xlint:infer-any",
  "-Xlint:nullary-unit",
  "-Xlint:option-implicit",
  "-Xlint:poly-implicit-overload",
  "-Xlint:private-shadow",
  "-Xlint:stars-align",
  "-Xlint:type-parameter-shadow",
  "-Ywarn-dead-code",
  "-Ywarn-numeric-widen",
  "-encoding", "UTF-8"
)

// Assembly plugin settings — produce a fat JAR for Docker
assembly / assemblyMergeStrategy := {
  case PathList("META-INF", "MANIFEST.MF") => MergeStrategy.discard
  case PathList("META-INF", "services", _*) => MergeStrategy.concat
  case PathList("META-INF", _*) => MergeStrategy.discard
  case PathList("reference.conf") => MergeStrategy.concat
  case _ => MergeStrategy.first
}

assembly / mainClass := Some("cantontrace.Main")
