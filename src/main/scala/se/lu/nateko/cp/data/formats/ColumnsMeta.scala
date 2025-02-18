package se.lu.nateko.cp.data.formats

import scala.util.matching.Regex
import java.net.URI

class ColumnsMeta(val columns: Seq[ColumnMeta]) {
	val plainCols: Map[String, ValueFormat] = columns
		.collect { case PlainColumn(format, title, _, _, _) => title -> format }
		.toMap

	private val regexCols = columns.collect { case rc: RegexColumn => rc }
	val hasAnyRegexCols: Boolean = regexCols.nonEmpty
	val hasOptionalColumns: Boolean = columns.exists(_.isOptional)

	def matchColumn(colTitle: String): Option[ValueFormat] = plainCols.get(colTitle).orElse {
		regexCols.find(_.matches(colTitle)).map(_.format)
	}

	def matchesColumn(colTitle: String): Boolean =
		plainCols.contains(colTitle) || regexCols.exists(_.matches(colTitle))

	def findMissingColumns(actualColumns: Seq[String]): Seq[ColumnMeta] =
		columns.filter(c => !c.isOptional && !actualColumns.exists(c.matches))

	def lookupSinglePlainColumn(valueType: URI): Option[PlainColumn] =
		val cands = columns.collect:
			case pc : PlainColumn if pc.valueType == valueType => pc
		cands match
			case Seq(single) => Some(single)
			case _ => None
}

sealed trait ColumnMeta {
	def format: ValueFormat
	def matches(colTitle: String): Boolean
	def isOptional: Boolean
	def valueType: URI
	def flagColumnTitle: Option[String]
}

case class PlainColumn(
	format: ValueFormat,
	title: String,
	isOptional: Boolean,
	valueType: URI,
	flagColumnTitle: Option[String]
) extends ColumnMeta:
	def matches(colTitle: String): Boolean = title == colTitle
	override def toString = title


case class RegexColumn(
	format: ValueFormat,
	regex: Regex,
	isOptional: Boolean,
	valueType: URI,
	flagColumnTitle: Option[String]
) extends ColumnMeta:
	def matches(colTitle: String): Boolean = regex.findFirstIn(colTitle).isDefined
	override def toString = regex.toString


case class ColumnsMetaWithTsCol(colsMeta: ColumnsMeta, timeStampColumn: String)
