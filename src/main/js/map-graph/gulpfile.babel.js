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

const replaceSearch = "url(node_modules/leaflet/dist/images/";
const replacement = "url(/style/map-graph/images/";

const paths = {
	main: 'main/main.jsx',
	jsx: 'main/**/*.jsx',
	js: 'main/**/*.js',
	commonjs: '../common/main/**/*.js*',
	imagesSource: 'node_modules/leaflet/dist/**/*.png',
	styleTargetDir: '../../resources/style/map-graph/',
	target: '../../resources/',
	bundleFile: project + '.js'
};

const clean = _ => {
	return del([paths.target + paths.bundleFile], {force: true});
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
		.pipe(gp_replace(replaceSearch, replacement))
		.pipe(gulp.dest(paths.target));
};

const copyImages = _ => {
	return gulp.src(paths.imagesSource).pipe(gulp.dest(paths.styleTargetDir));
};


gulp.task('build', gulp.series(clean, copyImages, compileJs));

gulp.task('publish', gulp.series(buildConf.applyProdEnvironment, 'build'));

gulp.task('default', gulp.series('publish'));
