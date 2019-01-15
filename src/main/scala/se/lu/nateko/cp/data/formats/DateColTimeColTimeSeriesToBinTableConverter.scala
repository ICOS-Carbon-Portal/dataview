package se.lu.nateko.cp.data.formats

import java.time.LocalDate
import java.time.LocalTime
import java.time.LocalDateTime
import java.time.ZoneOffset

abstract class DateColTimeColTimeSeriesToBinTableConverter(colFormats: ColumnsMetaWithTsCol, columnNames: Array[String], offsetFromUtc: Int, nRows: Int)
	extends TimeSeriesToBinTableConverter(colFormats, columnNames, nRows){

	protected def timeCol: String
	protected def dateCol: String

	assert(colPositions.contains(timeCol), s"Missing $timeCol column")
	assert(colPositions.contains(dateCol), s"Missing $dateCol column")

	val timePos = sortedColumns.indexOf(timeCol)
	val datePos = sortedColumns.indexOf(dateCol)
	assert(timePos >= 0, s"Column $timeCol is missing from metadata descriptions")
	assert(datePos >= 0, s"Column $dateCol is missing from metadata descriptions")

	// TODO: Is it always a plain column?
	private val Seq(dateNull, timeNull, stampNull) = Seq(dateCol, timeCol, colFormats.timeStampColumn)
		.map(col => getNull(colFormats.colsMeta.plainCols(col)))

	override protected def getTimeStamp(cells: Array[String], parsed: Array[AnyRef]): AnyRef = {
		val date = parsed(datePos).asInstanceOf[Int]
		val time = parsed(timePos).asInstanceOf[Int]

		if(date == dateNull || time == timeNull) stampNull
		else{
			val locDate = LocalDate.ofEpochDay(date.toLong)

			val dt =
				if(time >= 86400){
					val locTime = LocalTime.ofSecondOfDay((time - 86400).toLong)
					LocalDateTime.of(locDate, locTime).plusHours((24 - offsetFromUtc).toLong)
				} else {
					val locTime = LocalTime.ofSecondOfDay(time.toLong)
					LocalDateTime.of(locDate, locTime).minusHours(offsetFromUtc.toLong)
				}
			Double.box(dt.toInstant(ZoneOffset.UTC).toEpochMilli.toDouble)
		}
	}

}