package se.lu.nateko.cp.data.formats

import se.lu.nateko.cp.data.api.CpDataParsingException
import se.lu.nateko.cp.data.formats.bintable.{BinTableRow, Schema}
import java.{util => ju}

class TimeSeriesToBinTableConverter(colsMeta: ColumnsMeta) {
	import TimeSeriesToBinTableConverter._

	private var parser: Parser = null
	private var header: TableRowHeader = null

	private def getParser(currHeader: TableRowHeader) = synchronized{
		if currHeader ne header then
			header = currHeader
			parser = new Parser(currHeader)
		parser
	}

	def parseRow(row: TableRow): BinTableRow = {
		val parser = getParser(row.header)
		try
			parser.parse(row)
		catch
			case err: Throwable =>
				throw new CpDataParsingException(s"Problem parsing row $row\nError message: ${err.getMessage}")
	}

	private class Parser(header: TableRowHeader){

		assertNoMissingColumns()

		private val (sortedCols, sortedFormats) = sortedColsAndSortedFormats(header, colsMeta)
		private val schema = getSchema(header.nRows, sortedFormats)

		private val indices: Array[Int] = {
			val lookup = computeIndices(header.columnNames)
			sortedCols.map(lookup.apply)
		}

		def parse(row: TableRow): BinTableRow = {
			assertConsistency(row)

			val parsed = Array.ofDim[AnyRef](indices.length)

			for(i <- parsed.indices){
				val cellValue = row.cells(indices(i))
				val valueFormat = sortedFormats(i)
				parsed(i) = ValueFormatParser.parse(cellValue, valueFormat)
			}

			new BinTableRow(parsed, schema)
		}

		private def assertConsistency(latestRow: TableRow): Unit = {
			if(latestRow.cells.length != header.columnNames.length) throw new CpDataParsingException(
				s"Expected ${header.columnNames.length} row cell values, got ${latestRow.cells.length}: " +
				latestRow.cells.mkString(", ")
			)
			val latestHeader = latestRow.header
			if(
				(header ne latestHeader) && (
					header.nRows != latestHeader.nRows ||
					!ju.Arrays.equals(
						header.columnNames.asInstanceOf[Array[AnyRef]],
						latestHeader.columnNames.asInstanceOf[Array[AnyRef]]
					)
				)
			) throw new CpDataParsingException(
				"Sequential rows had different headers. Could be due to reuse of TimeSeriesToBinTableConverter instance. Contact developers."
			)
		}

		private def assertNoMissingColumns(): Unit = {
			val missingColumns = colsMeta.findMissingColumns(header.columnNames.toIndexedSeq).map(_.toString)
			if(!missingColumns.isEmpty) throw new CpDataParsingException(
				s"Required columns were missing in the data: ${missingColumns.mkString(", ")}"
			)
		}
	}

}

object TimeSeriesToBinTableConverter {

	def computeIndices(strings: Array[String]): Map[String, Int] = {
		strings.zipWithIndex.groupBy(_._1).map{
			case (colName, nameIndexPairs) => (colName, nameIndexPairs.map(_._2).min)
		}
	}

	private def sortedColsAndSortedFormats(header: TableRowHeader, colsMeta: ColumnsMeta): (Array[String], Array[ValueFormat]) = {
		val sortedColFormats = header.columnNames.sorted.flatMap{cname =>
			colsMeta.matchColumn(cname)
				.map(valueFormat => cname -> valueFormat) //Option[String -> ValueFormat]
		}
		sortedColFormats.map(_._1) -> sortedColFormats.map(_._2)
	}

	private def getSchema(nRows: Int, sortedFormats: Array[ValueFormat]) = new Schema(
		sortedFormats.map(ValueFormatParser.getBinTableDataType),
		nRows.toLong
	)

	class CsvReadingSchema(
		val fetchIndices: Array[Int],
		val fetchedColumns: Array[String],
		val serializers: Array[AnyVal => String],
		val binSchema: Schema
	)

	def getReadingSchema(
		onlyColumnNames: Option[Array[String]],
		actualColumnNames: Option[Seq[String]],
		nRows: Int,
		colsMeta: ColumnsMeta
	): CsvReadingSchema = {

		val allColumns = actualColumnNames.getOrElse{
			colsMeta.columns.collect{
				case PlainColumn(_, colName, false, _, _) =>
					colName
			}
		}.toArray

		val header = TableRowHeader(allColumns, nRows)
		val (sortedCols, sortedFormats) = sortedColsAndSortedFormats(header, colsMeta)

		val fetchIndices = onlyColumnNames.getOrElse(allColumns).map(sortedCols.indexOf(_)).filter(_ >= 0)

		new CsvReadingSchema(
			fetchIndices,
			fetchIndices.map(sortedCols.apply),
			fetchIndices.map(sortedFormats.apply).map(ValueFormatParser.numCsvSerializer),
			getSchema(header.nRows, sortedFormats)
		)
	}
}
