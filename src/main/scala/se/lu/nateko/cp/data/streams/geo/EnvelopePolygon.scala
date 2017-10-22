package se.lu.nateko.cp.data.streams.geo

import scala.collection.mutable.Buffer
import scala.collection.mutable.Map
import scala.annotation.tailrec

class EnvelopePolygon {
	import EnvelopePolygon._

	private[this] val verts = Buffer.empty[Point]
	private[this] val edgeReplacements = Map.empty[Int, Point]

	def vertices: Seq[Point] = verts
	def vertice(idx: Int): Point = verts(shortcircuit(idx))
	def size: Int = verts.size

	private def shortcircuit(idx: Int): Int = {
		val curSize = verts.size
		if(curSize == 0) throw new NoSuchElementException("The polygon has no vertices")

		@tailrec def inner(idx: Int): Int = {
			if(curSize == 1) 0
			else if(idx < - curSize) inner(idx % curSize)
			else if(idx < 0) idx + curSize
			else idx % curSize
		}
		inner(idx)
	}

	def edgeAngle(idx: Int): Double = {
		if(verts.size < 2) throw new NoSuchElementException("The polygon has no edges")
		val from = vertice(idx)
		val to = vertice(idx + 1)
		Math.atan2((to.lat - from.lat).toDouble, (to.lon - from.lon).toDouble)
	}

	def verticeIsConcave(idx: Int): Boolean =
		angleDiff(edgeAngle(idx - 1), edgeAngle(idx)) <= 0

	def verticeCost(idx: Int): Double = if(!verticeIsConcave(idx)) Double.MaxValue else {
		val start = vertice(idx - 1)
		val stop = vertice(idx + 1)
		val self = vertice(idx)

		val oldIntersections = verts.indices.filter{i =>
			val v1 = verts(i); val v2 = vertice(i + 1)
			!segmentsDontIntersect(v1, v2, start, self) ||
			!segmentsDontIntersect(v1, v2, self, stop)
		}.toSet

		val noNewIntersections = verts.indices.forall{i =>
			oldIntersections.contains(i) ||
			segmentsDontIntersect(verts(i), vertice(i + 1), start, stop)
		}
		if(noNewIntersections) triangleArea2(start, self, stop) else Double.MaxValue
	}

	def edgeCost(idx: Int): Double = {
		val prev = edgeAngle(idx - 1)
		val curr = edgeAngle(idx)
		val next = edgeAngle(idx + 1)
		val diff = angleDiff(prev, next)

		if(diff >= 0 && diff < 0.9 * Math.PI){
			val diff1 = angleDiff(prev, curr)
			val diff2 = angleDiff(curr, next)

			if(diff1 >= 0 && diff2 >= 0){
				val start = vertice(idx)
				val stop = vertice(idx + 1)

				val top = if(diff > 0.01)
					lineLineIntersection(vertice(idx - 1), start, stop, vertice(idx + 2))
				else if(diff1 <= diff2)
					lineLineIntersection(vertice(idx + 2), stop, start, diff1, diff)
				else
					lineLineIntersection(vertice(idx - 1), start, stop, diff2, diff)

				edgeReplacements += idx -> top

				val oldIntersections = verts.indices.filterNot{i =>
					segmentsDontIntersect(verts(i), vertice(i + 1), start, stop)
				}.toSet

				val noNewIntersections = verts.indices.forall(i => oldIntersections.contains(i) || {
					val v1 = verts(i); val v2 = vertice(i + 1)
					segmentsDontIntersect(v1, v2, start, top) && segmentsDontIntersect(v1, v2, stop, top)
				})
				if(noNewIntersections) triangleArea2(start, top, stop) else Double.MaxValue
			} else Double.MaxValue
		} else Double.MaxValue
	}

	def reduceVerticesByOne(): Boolean = {
		val curSize = verts.size
		if(curSize < 4) throw new NoSuchElementException("The polygon has no removeable vertices")

		val removal = (
			verts.indices.map(i => new VerticeRemoval(i, verticeCost(i), false)) ++
			verts.indices.map(i => new VerticeRemoval(i, edgeCost(i), true))
		).minBy(_.cost)

		if(removal.cost == Double.MaxValue) false
		else {
			val idx = removal.idx
			if(removal.isEdge){
				val vert = edgeReplacements(idx)
				if(idx < curSize - 1){
					verts.remove(idx, 2)
					verts.insert(idx, vert)
				} else {//TODO Write a test for this branch
					verts.remove(idx, 1)
					verts.insert(idx, vert)
					verts.remove(0, 1)
				}
			} else
				verts.remove(idx)
			true
		}
	}

	private def isInside(p: Point): Boolean = {
		import EdgeRayRelationship._
		var isOnBorder = false
		var crossingCount = 0
		val iter = verts.indices.iterator
		val n = verts.size
		while(!isOnBorder && iter.hasNext){
			val idx = iter.next()
			computeRelationship(verts(idx), verts((idx + 1) % n), p) match{
				case Start => isOnBorder = true
				case Cross => crossingCount += 1
				case _ =>
			}
		}
		isOnBorder || crossingCount % 2 != 0
	}

	/***
	 * Adds a vertice, attaching it to the nearest edge with a degenerate zero-area protrusion.
	 * Effectively inserts 2 or 3 new vertices, depending on whether the nearest point on the nearest edge
	 * is a vertice or an inner point, respectively.
	 *
	 * returns false if the new vertice was inside the polygon (including border) and therefore has been discarded,
	 * true otherwise (i.e. the vertice has been added)
	 */
	def addVertice(vert: Point): Boolean = {
		val curSize = size
		if(curSize < 2) {
			if(verts.contains(vert)) false else {
				verts += vert
				true
			}
		}
		else !isInside(vert) && {

			val nearest = verts.indices.map{i =>
				val noe = nearestOnEdge(verts(i), verts((i + 1) % curSize), vert)
				noe.baseIdx = i + 1
				noe
			}.minBy(nearest => distSq(vert, nearest.point))

			import NearestKind._
			nearest.kind match{

				case FirstVertice =>
					verts.insert(nearest.baseIdx, vert, nearest.point)

				case SecondVertice =>
					verts.insert(nearest.baseIdx, nearest.point, vert)

				case InnerPoint =>
					verts.insert(nearest.baseIdx, nearest.point, vert, nearest.point)
			}
			true
		}
	}

	override def toString = verts.mkString("Polygon[", ", ", "]")
}

object EnvelopePolygon{

	def angleDiff(from: Double, to: Double): Double = {
		val diff0 = to - from
		if(diff0 > Math.PI) diff0 - 2 * Math.PI
		else if(diff0 <= - Math.PI) diff0 + 2 * Math.PI
		else diff0
	}

	def triangleArea2(a: Point, b: Point, c: Point): Double = Math.abs(
		(a.lon - c.lon) * (b.lat - a.lat) - (a.lon - b.lon) * (c.lat - a.lat)
	).toDouble

	def side(a: Point, b: Point, c: Point) = Math.signum(
		(a.lon - c.lon) * (b.lat - a.lat) - (a.lon - b.lon) * (c.lat - a.lat)
	)

	def segmentsDontIntersect(a: Point, b: Point, c: Point, d: Point): Boolean = {
		side(a, c, d) * side(b, c, d) == 1 ||
		side(c, a, b) * side(d, a, b) == 1 ||
		Math.min(a.lon, b.lon) > Math.max(c.lon, d.lon) ||
		Math.max(a.lon, b.lon) < Math.min(c.lon, d.lon) ||
		Math.min(a.lat, b.lat) > Math.max(c.lat, d.lat) ||
		Math.max(a.lat, b.lat) < Math.min(c.lat, d.lat)
	}

	/**
	 * Only to be called with lines that are not close to being parallel
	 */
	def lineLineIntersection(p1: Point, p2: Point, p3: Point, p4: Point): Point = {
		val denom = (p1.lon - p2.lon) * (p3.lat - p4.lat) - (p1.lat - p2.lat) * (p3.lon - p4.lon)

		val xnom = (p1.lon * p2.lat - p1.lat * p2.lon) * (p3.lon - p4.lon) -
			(p1.lon - p2.lon) * (p3.lon * p4.lat - p3.lat * p4.lon)

		val ynom = (p1.lon * p2.lat - p1.lat * p2.lon) * (p3.lat - p4.lat) -
			(p1.lat - p2.lat) * (p3.lon * p4.lat - p3.lat * p4.lon)

		new Point(xnom / denom, ynom / denom)
	}

	def lineLineIntersection(p1: Point, p2: Point, p3: Point, smallerAngle: Double, totalAngle: Double): Point = {
		if(smallerAngle == 0) Point((p2.lon + p3.lon) / 2, (p2.lat + p3.lat) / 2) else {
			val l12 = Math.sqrt(distSq(p1, p2))
			val base = Math.sqrt(distSq(p2, p3))
			val lInter = base / l12 * (Math.sin(smallerAngle) / Math.sin(totalAngle))
			Point(
				(p2.lon + lInter * (p2.lon - p1.lon)).toFloat,
				(p2.lat + lInter * (p2.lat - p1.lat)).toFloat
			)
		}
	}

	def distSq(p1: Point, p2: Point): Float = {
		val dx = p1.lon - p2.lon
		val dy = p1.lat - p2.lat
		dx * dx + dy * dy
	}

	object NearestKind extends Enumeration{
		val FirstVertice, SecondVertice, InnerPoint = Value
	}

	class NearestOnEdge(val kind: NearestKind.Value, val point: Point){
		var baseIdx: Int = _
	}

	class VerticeRemoval(val idx: Int, val cost: Double, val isEdge: Boolean)

	def nearestOnEdge(v1: Point, v2: Point, p: Point): NearestOnEdge = {

		val factor: Float = {
			val nom = (v2.lon - v1.lon) * (p.lon - v1.lon) + (v2.lat - v1.lat) * (p.lat - v1.lat)
			nom / distSq(v1, v2)
		}

		import NearestKind._

		if(factor <= 0) new NearestOnEdge(FirstVertice, v1)

		else if(factor >= 1) new NearestOnEdge(SecondVertice, v2)

		else new NearestOnEdge(InnerPoint,
			Point(v1.lon + (v2.lon - v1.lon) * factor, v1.lat + (v2.lat - v1.lat) * factor)
		)
	}
}
