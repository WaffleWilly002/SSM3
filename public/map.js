var tiles = {};
var activeBlocks = 0;

function setTiles() {
	tiles = {
		w: {
			c: color(51, 51, 51),
			stroke: true,
			fill: true,
			name: 'Wall tile'
		},
		h: {
			c: color(51, 51, 51, 100),
			stroke: false,
			fill: true,
			name: 'Half wall tile'
		},
		g: {
			c: color(0, 100),
			stroke: true,
			fill: false,
			name: 'Gun spawn point'
		},
		i: {
			c: color(0, 255, 0, 100),
			stroke: true,
			fill: false,
			name: 'Item spawn point'
		},
		s: {
			c: color(0),
			stroke: false,
			fill: false,
			name: 'Player spawn point'
		}
	};
}
var wallColor = 51;
var backgroundColor = 150;
var lerpDecay = true;
// var lerpRate = 0.003;
var lerpRateCur = 0.003;
var lerpDeadZone = 0.005;
var maxRatePoint = 1000;
var minRatePoint = 300;
var maxRate = 0.02;
var minRate = 0;
var runBlocks = true;
var MapHandler = function() {
	this.map;
	this.dataMap;
	this.ready = false;
	this.ts = 0;
	this.dmgQual = 3;
	if (!tiles.hasOwnProperty('w')) {
		setTiles();
	}
	this.set = function(newMap) {
		this.map = newMap;
		this.dataMap = [];
		for (var i = 0; i < newMap.length; i++) {
			this.dataMap.push([]);
			for (var i2 = 0; i2 < newMap[i].length; i2++) {
				var type = newMap[i][i2];
				this.dataMap[i].push({
					type: type,
					hp: settings.blockHP,
					blocks: [],
					isBreaking: false,
					x: i2,
					y: i,
					colorMod: false
				});
			}
		}
		this.ready = true;
	}
	this.setTs = function(ts) {
		this.ts = ts;
	}
	this.pixWidth = function() {
		if (!this.ready) {
			return 0;
		}
		return this.map[0].length * this.ts;
	}
	this.pixHeight = function() {
		if (!this.ready) {
			return 0;
		}
		return this.map.length * this.ts;
	}
	this.setColor = function(tileDef) {
		if (tileDef.fill) {
			fill(tileDef.c);
		} else {
			noFill();
		}
		if (tileDef.stroke) {
			stroke(tileDef.c);
		} else {
			noStroke();
		}
	}
	this.initBlocks = function(tile) {
		var blocks = [];
		for (var i = 0; i < this.dmgQual; i++) {
			blocks.push([]);
			for (var i2 = 0; i2 < this.dmgQual; i2++) {
				blocks[i].push({
					decay: 0,
					decayRate: random(0.5, 1.2),
					x: i2 * this.ts / this.dmgQual,
					y: i * this.ts / this.dmgQual
				});
			}
		}
		activeBlocks += this.dmgQual * this.dmgQual;
		tile.blocks = blocks;
		tile.isBreaking = true;
	}
	this.tileDmg = function(tile) {
		if (!this.ready) {
			return;
		}
		var t = this.dataMap[tile.y][tile.x];
		if (!t.isBreaking) {
			this.initBlocks(t);
		}
		var amt = p5.prototype.map(tile.hp, 0, settings.blockHP, 1, 0);
		for (var i = 0; i < t.blocks.length; i++) {
			for (var i2 = 0; i2 < t.blocks[i].length; i2++) {
				var b = t.blocks[i][i2];
				b.decay = b.decayRate * amt;
			}
		}
		t.hp = tile.hp;
	}
	this.drawBlocks = function(tile) {
		var isDone = true;
		for (var i = 0; i < tile.blocks.length && runBlocks; i++) {
			for (var i2 = 0; i2 < tile.blocks[i].length; i2++) {
				var b = tile.blocks[i][i2];
				var col = p5.prototype.map(b.decay, 0, 1, wallColor, backgroundColor);
				col = constrain(col, wallColor, backgroundColor);
				fill(col);
				stroke(col);
				rect(b.x + tile.x * this.ts,
					b.y + tile.y * this.ts,
					this.ts / this.dmgQual,
					this.ts / this.dmgQual);
				if (lerpDecay) {
					var wantedDec = p5.prototype.map(tile.hp, 0, settings.blockHP, 1, 0);
					b.decay = lerp(b.decay, wantedDec, lerpRateCur);
					if (abs(wantedDec - b.decay) > lerpDeadZone) {
						isDone = false;
					}
				}
			}
		}
		if ((isDone && lerpDecay) || !runBlocks) {
			tile.isBreaking = false;
			tile.colorMod = p5.prototype.map(tile.hp, 0, settings.blockHP, backgroundColor, wallColor);
			tile.blocks = [];
			activeBlocks -= this.dmgQual * this.dmgQual;
		}
	}
	this.drawTile = function(t) {
		strokeWeight(1); //EHHHH
		if (t.type == '-') {
			return;
		}
		var tileDef = tiles[t.type];
		if (!tileDef) {
			console.log('No tile definition for: ', t);
			return;
		}
		if (!tileDef.stroke && !tileDef.fill) {
			return;
		}
		this.setColor(tileDef);
		if (t.isBreaking) {
			this.drawBlocks(t);
		} else {
			if (t.colorMod) {
				fill(t.colorMod);
				stroke(t.colorMod);
			}
			rect(t.x * this.ts, t.y * this.ts, this.ts, this.ts);
		}
	}
	this.draw = function() {
		if (!this.ready) {
			return;
		}
		stroke(51);
		fill(51);
		for (var i = 0; i < this.dataMap.length; i++) {
			for (var i2 = 0; i2 < this.dataMap[i].length; i2++) {
				var t = this.dataMap[i][i2];
				this.drawTile(t)
			}
		}
		var wantedLRate = p5.prototype.map(activeBlocks, minRatePoint, maxRatePoint, minRate, maxRate);
		lerpRateCur = constrain(wantedLRate, minRate, maxRate);
	}
	this.blockAt = function(x, y) {
		if (!this.ready) {
			return '';
		}
		var nx = floor(x / this.ts);
		var ny = floor(y / this.ts);
		if (nx < 0 || ny < 0 || nx > this.dataMap.length - 1 || ny > this.dataMap[0].length - 1) {
			return '';
		}
		if (!this.dataMap[ny][nx]) {
			return '';
		}
		return this.dataMap[ny][nx].type;
	}
	this.setBlock = function(x, y, newType) {
		if (!this.ready) {
			return;
		}
		if (x < 0 || y < 0 || x > this.dataMap.length - 1 || y > this.dataMap[0].length - 1) {
			return;
		}
		if (this.dataMap[y][x].blocks) {
			activeBlocks -= this.dmgQual * this.dmgQual;
		}
		this.dataMap[y][x].type = newType;
	}
}