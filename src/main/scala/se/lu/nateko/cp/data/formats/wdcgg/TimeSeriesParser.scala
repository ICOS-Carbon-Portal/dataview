package se.lu.nateko.cp.data.formats.wdcgg

object TimeSeriesParser {

	case class Header(
		headerLength: Int,
		totLength: Int,
		columnNames: Array[String],
		parameter: String,
		offsetFromUtc: Int,
		kvPairs: Map[String, String]
	)

	case class Accumulator(
			header: Header,
			lineNumber: Int,
			cells: Array[String]
		){

		def incrementLine = copy(lineNumber = lineNumber + 1)
		def isOnData = (header.headerLength > 0 && lineNumber > header.headerLength)
		def changeHeader(
				headerLength: Int = header.headerLength,
				totLength: Int = header.totLength,
				columnNames: Array[String] = header.columnNames,
				parameter: String = header.parameter,
				offsetFromUtc: Int = header.offsetFromUtc,
				kvPairs: Map[String, String] = header.kvPairs
			): Accumulator =
			copy(header = header.copy(headerLength, totLength, columnNames, parameter, offsetFromUtc, kvPairs))
	}

	private val headerPattern = """C\d\d.*""".r
	private val headerKvPattern = """C\d\d ([^:]+): ?(.*)""".r
	private val totLinesPattern = """C\d\d TOTAL LINES: (\d+)""".r
	private val headLinesPattern = """C\d\d HEADER LINES: (\d+)""".r
	private val wsPattern = "\\s+".r

	def seed = Accumulator(Header(0, 0, Array.empty, "", 0, Map.empty), 0, Array.empty)

	def isHeaderLine(line: String): Boolean =
		headerPattern.findFirstIn(line).isDefined

	def parseLine(acc: Accumulator, line: String): Accumulator = {

		if(acc.header.headerLength > 0 && acc.lineNumber >= acc.header.headerLength)
			acc.copy(cells = wsPattern.split(line), lineNumber = acc.lineNumber + 1)

		else if(acc.lineNumber == acc.header.headerLength - 1) {
			val paramName = acc.header.parameter
			val colNamesAttempt = wsPattern.split(line)

			if(colNamesAttempt.length > 7 && colNamesAttempt.contains(paramName)) {
				//the column names line is present
				val colNames = mapColNames(colNamesAttempt.drop(1), paramName)
				acc.changeHeader(columnNames = colNames).incrementLine
			}else{
				//bad file, missing the column names row; amending it with standard column names
				val fakeColNames = Array("DATE", "TIME", "DATE", "TIME", paramName, "ND", "SD", "F", "CS", "REM")
				val colNames = mapColNames(fakeColNames, paramName)
				acc.changeHeader(headerLength = acc.header.headerLength - 1, columnNames = colNames)
					.copy(cells = colNamesAttempt).incrementLine
			}
		}

		else (line match {
			case headLinesPattern(n) =>
				acc.changeHeader(headerLength = n.toInt)

			case totLinesPattern(n) =>
				acc.changeHeader(totLength = n.toInt)

			case headerKvPattern(key, value) =>

				val withSpecialKvs =
					if(key == "TIME ZONE")
						acc.changeHeader(offsetFromUtc = parseUtcOffset(value))
					else if(key == "PARAMETER")
						acc.changeHeader(parameter = value)
					else acc

				if(headerKeys.contains(key))
					withSpecialKvs.changeHeader(kvPairs = acc.header.kvPairs + ((mapKey(key), value)))
				else withSpecialKvs

			case _ if isHeaderLine(line) => acc
		}).incrementLine
	}

	def parseUtcOffset(offset: String): Int = {
		val stripped = offset.stripPrefix("Other").stripPrefix("Local time").trim.stripPrefix("UTC").trim
		//TODO Check if absent time zone info does imply UTC
		if(stripped.isEmpty) 0 else stripped.toInt
	}

	private def mapColNames(origColNames: Array[String], paramColName: String) = {
		origColNames.map(col => if(col == paramColName) "PARAMETER" else col)
	}

	private val headerKeys = Set(
		"STATION NAME", "OBSERVATION CATEGORY", "COUNTRY/TERRITORY", "PARAMETER",
		"TIME INTERVAL", "MEASUREMENT UNIT", "MEASUREMENT METHOD", "SAMPLING TYPE",
		"MEASUREMENT SCALE", "CONTRIBUTOR"
	)

	private val keyRenamings = Map("COUNTRY/TERITORY" -> "COUNTRY/TERRITORY")
	private def mapKey(key: String): String = keyRenamings.getOrElse(key, key)

}

