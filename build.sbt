val defaultScala = "2.12.3"

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
	)
)

val akkaVersion = "2.4.19"
val akkaHttpVersion = "10.0.9"

lazy val netcdf = (project in file("netcdf"))
	.settings(commonSettings: _*)
	.settings(
		name := "data-netcdf",
		version := "0.1.0-SNAPSHOT",
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
			"com.typesafe.akka"   %% "akka-http-spray-json"              % akkaHttpVersion % "provided"
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

lazy val data = (project in file("."))
	.dependsOn(netcdf)
	.enablePlugins(SbtTwirl)
	.settings(commonSettings: _*)
	.settings(
		name := "data",
		version := "0.4.2",

		libraryDependencies ++= Seq(
			"com.typesafe.akka"  %% "akka-http-spray-json"               % akkaHttpVersion,
			"com.typesafe.akka"  %% "akka-slf4j"                         % akkaVersion,
			"ch.qos.logback"      % "logback-classic"                    % "1.1.3",
			"se.lu.nateko.cp"    %% "cpauth-core"                        % "0.5-SNAPSHOT",
			"se.lu.nateko.cp"    %% "meta-core"                          % "0.3.4-SNAPSHOT",
			"se.lu.nateko.cp"    %% "views-core"                         % "0.3.1-SNAPSHOT",

		// *** manually published on CP Nexus 3rd party repo ***
			"org.irods.jargon"    % "jargon-core"      % "4.0.2.4", //IRODS client core features
			"org.globus.jglobus"  % "cog-jglobus"      % "1.8.0",   //jargon-core dependency
			"com.claymoresystems" % "puretls"          % "1.1",     //cog-jglobus dependency
			// other dependencies of jargon-core are commons-io and commons-codec,
			// but they are already present in this project transitively

		// *** end of manually published on CP Nexus 3rd party repo ***

			"org.scalatest"      %% "scalatest"        % "3.0.3" % "test"
		),

		scalacOptions += "-Ywarn-unused-import:false"

//		initialCommands in console := """
//			import se.lu.nateko.cp.data.MassUpload._
//		""",

//		cleanupCommands in console := """
//			system.terminate()
//		"""
	)
