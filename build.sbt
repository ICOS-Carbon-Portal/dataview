val defaultScala = "2.12.4"

//watchService in ThisBuild := (() => new sbt.io.PollingWatchService(pollInterval.value)) //SBT bug

lazy val commonSettings = Seq(
	organization := "se.lu.nateko.cp",
	scalaVersion := defaultScala,

	scalacOptions ++= Seq(
		"-target:jvm-1.8",
		"-encoding", "UTF-8",
		"-unchecked",
		"-feature",
		"-deprecation",
		"-Xfuture",
		"-Yno-adapted-args",
		"-Ywarn-dead-code",
		"-Ywarn-numeric-widen",
		"-Ywarn-unused"
	),
	javacOptions ++= Seq("-source", "1.8", "-target", "1.8")
)

val akkaVersion = "2.5.12"
val akkaHttpVersion = "10.1.1"

lazy val netcdf = (project in file("netcdf"))
	.settings(commonSettings: _*)
	.settings(
		name := "data-netcdf",
		version := "0.1.1-SNAPSHOT",
		libraryDependencies ++= Seq(
			"edu.ucar"            % "cdm"                                % "4.5.5" excludeAll( //manually published on nexus.icos-cp.eu
				ExclusionRule(organization = "com.beust", name = "jcommander"),
				//ExclusionRule(organization = "com.google.guava", name = "guava"),
				ExclusionRule(organization = "com.google.protobuf", name = "protobuf-java"),
				//ExclusionRule(organization = "edu.ucar", name = "httpservices"),
				ExclusionRule(organization = "net.sf.ehcache", name = "ehcache-core"),
				ExclusionRule(organization = "org.apache.httpcomponents", name = "httpcore"),
				ExclusionRule(organization = "org.apache.httpcomponents", name = "httpclient"),
				ExclusionRule(organization = "org.apache.httpcomponents", name = "httpmime"),
				ExclusionRule(organization = "org.itadaki", name = "bzip2"),
				ExclusionRule(organization = "org.jdom", name = "jdom2"),
				ExclusionRule(organization = "org.quartz-scheduler", name = "quartz"),
				ExclusionRule(organization = "org.slf4j", name = "jcl-over-slf4j"),
				ExclusionRule(organization = "org.slf4j", name = "slf4j-api")
			),
			"com.typesafe.akka"   %% "akka-http-spray-json"              % akkaHttpVersion % "provided",
			"com.typesafe.akka"   %% "akka-stream"                       % akkaVersion     % "provided"
		),
		publishTo := {
			val nexus = "https://repo.icos-cp.eu/content/repositories/"
			if (isSnapshot.value)
				Some("snapshots" at nexus + "snapshots")
			else
				Some("releases"  at nexus + "releases")
		},
		crossScalaVersions := Seq(defaultScala, "2.11.11"),
		credentials += Credentials(Path.userHome / ".ivy2" / ".credentials")
	)

val frontendBuild = taskKey[Unit]("Builds the front end apps")
frontendBuild := {
	import scala.sys.process.Process
	import java.io.File
	val log = streams.value.log

	log.info("Starting front-end build for common")
	Process("npm install", new File("src/main/js/common/")).!

	val errors: List[String] = new File("src/main/js/").listFiles.filter(_.getName != "common").par.map{pwd =>
	  	val projName = pwd.getName
		log.info("Starting front-end build for " + projName)
		val exitCode = (Process("npm install", pwd) #&& Process("npm run publish", pwd)).!

		if(exitCode == 0) {
			log.info("Finished front-end build for " + projName)
			None
		}else {
			log.error(s"Front-end build for $projName failed")
			Some(s"Front end building for $projName returned non-zero exit code $exitCode")
		}
	}.toList.flatten

	if(errors.isEmpty)
		log.info("Front end builds are complete!")
	else
		throw new Exception(errors.mkString("\n"))
}

lazy val data = (project in file("."))
	.dependsOn(netcdf)
	.enablePlugins(SbtTwirl,IcosCpSbtDeployPlugin)
	.settings(commonSettings: _*)
	.settings(
		name := "data",
		version := "0.4.4",

		libraryDependencies ++= Seq(
			"com.typesafe.akka"  %% "akka-http-spray-json"               % akkaHttpVersion,
			"com.typesafe.akka"  %% "akka-stream"                        % akkaVersion,
			"com.typesafe.akka"  %% "akka-slf4j"                         % akkaVersion,
			"ch.qos.logback"      % "logback-classic"                    % "1.1.3",
			"se.lu.nateko.cp"    %% "cpauth-core"                        % "0.6.0-SNAPSHOT",
			"se.lu.nateko.cp"    %% "meta-core"                          % "0.3.11-SNAPSHOT",
			"se.lu.nateko.cp"    %% "views-core"                         % "0.3.8-SNAPSHOT",
			"org.irods.jargon"    % "jargon-core"                        % "4.2.2.0-RELEASE", //IRODS client core features

			"org.gillius"         % "jfxutils"         % "1.0"   % "test",
			"org.scalatest"      %% "scalatest"        % "3.0.3" % "test"
		),

		fork in (Test, run) := true,

		logBuffered in Test := false,

		scalacOptions += "-Ywarn-unused-import:false",

		cpDeployTarget := "cpdata",
		cpDeployBuildInfoPackage := "se.lu.nateko.cp.cpdata",

		// Override the "assembly" command so that we always run "npm publish"
		// first - thus generating javascript files - before we package the
		// "fat" jarfile used for deployment.
		assembly := (Def.taskDyn{
			val original = assembly.taskValue
			// Referencing the task's 'value' field will trigger the npm command
			frontendBuild.value
			// Then just return the original "assembly command"
			Def.task(original.value)
		}).value,

//		initialCommands in console := """
//			import se.lu.nateko.cp.data.api.B2Playground._
//		""",

//		cleanupCommands in console := """
//			stop()
//		"""
	)

