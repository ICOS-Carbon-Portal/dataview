'use strict';

import gulp from 'gulp';
import gp_uglify from 'gulp-uglify';
import browserify from 'browserify';
import bcss from 'browserify-css';
import gp_replace from 'gulp-replace';
import buffer from 'vinyl-buffer';
import del from 'del';
import source from 'vinyl-source-stream';
import babelify from 'babelify';
import buildConf from '../common/main/buildConf.js';

const currentPath = __dirname;
const project = currentPath.split('/').pop();

const paths = {
	main: 'main/main.jsx',
	jsx: 'main/**/*.jsx',
	js: 'main/**/*.js',
	commonjs: '../common/main/**/*.js*',
	imagesSource: 'node_modules/icos-cp-netcdfmap/dist/**/*.png',
	styleTargetDir: '../../resources/style/netcdf/',
	target: '../../resources/',
	bundleFile: project + '.js'
};

const clean = _ => {
	return del([paths.target + paths.bundleFile, paths.styleTargetDir], {force: true});
};

const copyImages = _ => {
	return gulp.src(paths.imagesSource).pipe(gulp.dest(paths.styleTargetDir));
};

const compileJs = _ =>  {
	const isProduction = process.env.NODE_ENV === 'production';

	let stream = browserify({
			entries: [paths.main],
			debug: !isProduction
		})
		.transform(bcss, {
			global: true,
			minify: true,
			minifyOptions: {compatibility: '*'}
		})
		.transform(babelify, {presets: buildConf.presets})
		.bundle()
		.on('error', function(err){
			console.log(err);
			this.emit('end');
		})
		.pipe(source(paths.bundleFile));

	stream = isProduction
		? stream
			.pipe(buffer())
			.pipe(gp_uglify())
		: stream;

	return stream
		.pipe(gp_replace('url(node_modules/icos-cp-netcdfmap/dist/images/', 'url(/style/netcdf/images/'))
		.pipe(gulp.dest(paths.target));
};

gulp.task('build', gulp.series(clean, copyImages, compileJs));

gulp.task('publish', gulp.series(buildConf.applyProdEnvironment, 'build'));

gulp.task('default', gulp.series('publish'));
