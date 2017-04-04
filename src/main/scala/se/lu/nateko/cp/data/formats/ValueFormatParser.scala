package se.lu.nateko.cp.data.formats

import java.time.LocalDate
import java.time.LocalTime
import java.util.Locale
import se.lu.nateko.cp.data.formats.bintable.DataType
import se.lu.nateko.cp.data.formats.bintable.ValueParser
import java.time.format.DateTimeParseException
import java.time.Instant
import java.time.format.DateTimeFormatter

class ValueFormatParser(locale: Locale){
	import ValueFormatParser._

	private[this] val parser = new ValueParser(locale)

	def parse(value: String, format: ValueFormat): AnyRef = format match {
		case IntValue =>
			parser.parse(value, DataType.INT)
		case FloatValue =>
			parser.parse(value, DataType.FLOAT)
		case DoubleValue =>
			parser.parse(value, DataType.DOUBLE)
		case StringValue =>
			value
		case Iso8601Date =>
			Int.box(LocalDate.parse(value).toEpochDay.toInt)
		case EtcDate =>
			Int.box(LocalDate.parse(value, etcDateFormatter).toEpochDay.toInt)
		case Iso8601DateTime =>
			Double.box(Instant.parse(value).toEpochMilli)
		case Iso8601TimeOfDay =>
			if(value.startsWith("24:")) {
				val residualTime = "00:" + value.substring(3)
				Int.box(86400 + LocalTime.parse(residualTime).toSecondOfDay)
			}
			else if(value.charAt(1) == ':') parseIsoTimeOfDay("0" + value)
			else parseIsoTimeOfDay(value)
	}

	def getBinTableDataType(format: ValueFormat): DataType = format match {
		case IntValue => DataType.INT
		case FloatValue => DataType.FLOAT
		case DoubleValue => DataType.DOUBLE
		case StringValue => DataType.STRING
		case Iso8601Date | EtcDate => DataType.INT
		case Iso8601DateTime => DataType.DOUBLE
		case Iso8601TimeOfDay => DataType.INT
	}

	def getNullRepresentation(format: ValueFormat): AnyRef = format match {
		case IntValue => Int.box(Int.MinValue)
		case FloatValue => Float.box(Float.NaN)
		case DoubleValue => Double.box(Double.NaN)
		case StringValue => ""
		case Iso8601Date | EtcDate => Int.box(Int.MinValue)
		case Iso8601DateTime => Double.box(Double.NaN)
		case Iso8601TimeOfDay => Int.box(Int.MinValue)
	}
}

object ValueFormatParser{
	val etcDateFormatter = DateTimeFormatter.ofPattern("d/M/yyyy")

	def parseIsoTimeOfDay(time: String): Integer =
		Int.box(LocalTime.parse(time).toSecondOfDay)
}
