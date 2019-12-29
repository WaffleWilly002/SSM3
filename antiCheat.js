function dist(x1, y1, x2, y2) {
	var a = x1 - x2;
	var b = y1 - y2;
	return Math.sqrt(a * a + b * b);
}
String.prototype.incert = function(idx, other) {
	return this.substring(0, idx) + other + this.substring(idx + 1, this.length);
}
var AntiCheat = function() {
	this.maxDistForShoot = 30;
	this.maxDistForMove = 20;
	this.maxVel = 9;
	this.players = [];
	this.runShoot = function(player, data) {
		var d = dist(player.pos.x, player.pos.y, data.x, data.y);
		if (d > this.maxDistForShoot) {
			return this.genRet('% moved to quick (shooting), distance of: %', player.name, d.toFixed(2));
		}
		return false;
	}
	this.runPlayerData = function(player, data) {
		var lastP = this.players.find(p => p.id == player.id);
		data.id = player.id;
		if (!lastP) {
			this.players.push(data);
			return;
		}
		var err = false;
		if (data.pos && lastP.pos) {
			var d = dist(lastP.pos.x, lastP.pos.y, data.pos.x, data.pos.y);
			if (d > this.maxDistForMove) {
				err = this.genRet('% moved to quick (gameData), distance of: %', player.name, d.toFixed(2));
			}
		}

		if (data.vel && data.vel.x + data.vel.y > this.maxVel) {
			err = this.genRet('% has abnormal velocity X: %, Y: %', player.name, data.vel.x, data.vel.y);
		}
		this.players[this.players.findIndex(p => p.id == player.id)] = data;
		return err;
	}
	this.genRet = function() {
		var args = arguments;
		var str = arguments[0];
		var idx = 1;
		var lIdx = str.indexOf('%');
		while (lIdx != -1) {
			str = str.incert(lIdx, args[idx++]);
			lIdx = str.indexOf('%');
		}
		return [3, str];
	}
}
module.exports = new AntiCheat();