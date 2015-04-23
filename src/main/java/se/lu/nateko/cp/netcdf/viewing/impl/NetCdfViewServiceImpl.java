package se.lu.nateko.cp.netcdf.viewing.impl;

import java.io.File;
import java.io.IOException;
import java.util.Formatter;
import java.util.Locale;

import se.lu.nateko.cp.netcdf.viewing.*;
import ucar.ma2.Array;
import ucar.ma2.InvalidRangeException;
import ucar.ma2.MAMath;
import ucar.ma2.Section;
import ucar.nc2.Variable;
import ucar.nc2.dataset.CoordinateAxis1DTime;
import ucar.nc2.dataset.NetcdfDataset;
import ucar.nc2.dataset.VariableDS;
import ucar.nc2.time.CalendarDate;

public class NetCdfViewServiceImpl implements NetCdfViewService{

	private final ServiceSpecification spec;
	private final File file;

	public NetCdfViewServiceImpl(ServiceSpecification spec){
		this.spec = spec;
		this.file = spec.file;
	}

	@Override
	public String[] getAvailableDates() throws IOException {
		NetcdfDataset ds = null;

		try {
			ds = NetcdfDataset.openDataset(file.getAbsolutePath());

			Variable ncVar = ds.findVariable(spec.dimensions.dateVariable);
			VariableDS ncVarDS = new VariableDS(null, ncVar, false);

			StringBuilder sb = new StringBuilder();
			Formatter formatter = new Formatter(sb, Locale.ENGLISH);
			CoordinateAxis1DTime sliceAxis = CoordinateAxis1DTime.factory(ds, ncVarDS, formatter);

			return sliceAxis.getCalendarDates()
					.stream()
					.map(calendarDate -> calendarDate.toString())
					.toArray(n -> new String[n]); 
		} catch (IOException ioe) {
			throw new IOException("Could not open file " + file.getAbsolutePath());
		}finally{
			if(ds != null) ds.close();
		}
	}

	@Override
	public Raster getRaster(String time) throws IOException, InvalidRangeException {
		NetcdfDataset ds = null;

		try {
			ds = NetcdfDataset.openDataset(file.getAbsolutePath());

			Variable ncVar = ds.findVariable(spec.varName);
			int lonDimInd = ncVar.findDimensionIndex(spec.dimensions.lonDimension);
			int latDimInd = ncVar.findDimensionIndex(spec.dimensions.latDimension);
			
			int sizeLon = ncVar.getDimension(lonDimInd).getLength();
			int sizeLat = ncVar.getDimension(latDimInd).getLength();
			boolean latFirst = latDimInd < lonDimInd;

			Variable dateVar = ds.findVariable(spec.dimensions.dateVariable);
			//TODO What does boolean enhance do
			VariableDS dateVarDS = new VariableDS(null, dateVar, false);
			StringBuilder sb = new StringBuilder();
			Formatter formatter = new Formatter(sb, Locale.ENGLISH);

			CoordinateAxis1DTime sliceAxis = CoordinateAxis1DTime.factory(ds, dateVarDS, formatter);
			CalendarDate date = CalendarDate.parseISOformat("gregorian", time);
			int dateTimeInd = sliceAxis.findTimeIndexFromCalendarDate(date);

			int[] origin = new int[] {dateTimeInd, 0, 0};
			int[] size = new int[] {1, latFirst ? sizeLat : sizeLon, latFirst ? sizeLon : sizeLat};
			Section sec = new Section(origin, size);

			Array arrFullDim = ncVar.read(sec);
			Array arrReduced = arrFullDim.reduce();

			double min = MAMath.getMinimum(arrReduced);
			double max = MAMath.getMaximum(arrReduced);
			
			return new RasterImpl(arrReduced, sizeLon, sizeLat, min, max, latFirst);

		} catch (IOException ioe) {
			throw new IOException("IO error when working with file " + file.getAbsolutePath(), ioe);
		}finally{
			if(ds != null) ds.close();
		}
	}

}
