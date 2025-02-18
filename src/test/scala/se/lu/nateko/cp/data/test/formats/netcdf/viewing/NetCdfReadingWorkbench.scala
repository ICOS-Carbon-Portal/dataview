package se.lu.nateko.cp.data.test.formats.netcdf.viewing

import org.scalatest.funspec.AnyFunSpec
import se.lu.nateko.cp.data.formats.ColumnsMeta
import se.lu.nateko.cp.data.formats.PlainColumn
import se.lu.nateko.cp.data.formats.ValueFormat.FloatValue
import se.lu.nateko.cp.data.formats.ValueFormat.Iso8601DateTime
import se.lu.nateko.cp.data.formats.netcdf.ObspackNcToBinTable
import ucar.nc2.dataset.CoordinateAxisTimeHelper
import ucar.nc2.dataset.NetcdfDatasets
import ucar.nc2.time.Calendar

import java.nio.file.Path
import scala.util.Using
import java.net.URI

class NetCdfReadingWorkbench extends AnyFunSpec {

	val path1 = getClass.getResource("/co2_con_aircraft-insitu_42_allvalid_small.nc").getPath
	val path2 = getClass.getResource("/co2_ssl_tower-insitu_23_allvalid-12magl_small.nc").getPath

	val dummyURI = URI("https://meta.icos-cp.eu")

	describe("Netcdf reading workbench"){
		val columnsMeta = new ColumnsMeta(Seq(
			PlainColumn(FloatValue, "value", false, dummyURI, None),
			PlainColumn(Iso8601DateTime, "time", false, dummyURI, None)
		))

		def countRows(path: String): Int =
			val watch = new StopWatch
			import watch.elapsedMs

			println(s"At time $elapsedMs ms, prepared ObspackNcToBinTable for $path")

			val rows = ObspackNcToBinTable(Path.of(path), columnsMeta).get.readRows()
			println(s"At time $elapsedMs ms, prepared rows Iterable for $path")

			var size: Int = 0
			rows.foreach{_ => size += 1}
			println(s"At time $elapsedMs ms, iterated through $size rows")
			size


		ignore("Counts the rows in the files"){
			countRows(path1)
			countRows(path2)
		}

		ignore("Reading date variable"){
			Using(NetcdfDatasets.openDataset(path1)){ncfile =>
				val timeVar = ncfile.findVariable("time")
				val unit = timeVar.attributes().findAttribute("units").getStringValue
				val timeHelper = new CoordinateAxisTimeHelper(Calendar.gregorian, unit)
				val ncArr = timeVar.read()
				val firstDate = timeHelper.makeCalendarDateFromOffset(ncArr.getDouble(0))
				val lastDate = timeHelper.makeCalendarDateFromOffset(ncArr.getDouble(ncArr.getSize.toInt - 1))
				println(firstDate)
				println(lastDate)

				// val sb = new java.lang.StringBuilder();
				// val formatter = new Formatter(sb, Locale.ENGLISH);
				// //val group = new Group(ncfile, null, "x07")
				// val sliceAxis = CoordinateAxis1DTime.factory(ncfile, VariableDS.builder().copyFrom(timeVar).build(null), formatter);
				// val dList = sliceAxis.getCalendarDates()
				// println(s"got number of dates: ${dList.size()}")
				// println(dList.get(0))
				// println(dList.get(dList.size - 1))
			}.get
		}

	}

	private class StopWatch:
		private val start = System.currentTimeMillis()
		def elapsedMs: Long = System.currentTimeMillis() - start

}
