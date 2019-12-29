function genFlag(teamIdx) {
	var p1 = settings.mapInfo.ctfData[teamIdx];
	var p2 = settings.mapInfo.ctfData[teamIdx == 0 ? 1 : 0];
	return {
		pos: {
			x: p1.x,
			y: p1.y
		},
		heldBy: undefined,
		teamId: teams[teamIdx].id,
		color: teams[teamIdx].color,
		caps: 0,
		capPoint: {
			x: p2.x,
			y: p2.y
		},
		homePoint: {
			x: p1.x,
			y: p1.y
		}
	}
}
module.exports = {
	name: 'ctf',
	flags: [],
	lastPacket: [],
	net: undefined,
	settingsOverrides: {
		gamemode: 'ctf',
		teamMode: true,
		teams: 2
	},
	onPick: function() {
		this.flags.push(genFlag(0));
		this.flags.push(genFlag(1));
		settings.capsToWin = 3;
		settingTypes.capsToWin = ['1', '2', '3', '4', '5'];
		sendToAll('update_settings', settings);
		sendToAll('update_settings', settingTypes);
	},
	onTick: function() {
		if (JSON.stringify(this.flags) != this.lastPacket || tick % 60 == 0) {
			sendToAll('gamemode_data', this.flags);
			this.lastPacket = JSON.stringify(this.flags);
		}
		players.forEach(player => {
			if (player.team && !player.dead) {
				var myFlag = this.flags.find(f => f.teamId == player.team);
				var enFlag = this.flags.find(f => f.teamId != player.team);
				if (Math.dist(myFlag.pos.x, myFlag.pos.y, player.pos.x, player.pos.y) < settings.playerSize && myFlag.heldBy == undefined) {
					myFlag.pos.x = myFlag.homePoint.x;
					myFlag.pos.y = myFlag.homePoint.y;
				}
				if (Math.dist(enFlag.pos.x, enFlag.pos.y, player.pos.x, player.pos.y) < settings.playerSize && enFlag.heldBy == undefined) {
					enFlag.heldBy = player.id;
				}
			}
		});
		this.flags.forEach(flag => {
			if (flag.heldBy != undefined) {
				var player = players.find(p => p.id == flag.heldBy);
				if (player.hp <= 0) {
					log(0, 'Player dropped flag');
					flag.heldBy = undefined;
				}
				flag.pos.x = player.pos.x;
				flag.pos.y = player.pos.y;
				if (Math.dist(flag.pos.x, flag.pos.y, flag.capPoint.x, flag.capPoint.y) < settings.playerSize) {
					flag.pos.x = flag.homePoint.x;
					flag.pos.y = flag.homePoint.y;
					flag.caps++;
					flag.heldBy = undefined;
					log(0, 'Flag capped');
				}
			}
		});
	},
	onPlayerSpawn: function(player) {
		var holdingFlag = this.flags.find(f => f.heldBy == player.id);
		if (holdingFlag) {
			log(0, 'Player was holding flag when spawned');
			holdingFlag.heldBy = undefined;
		}
	},
	onPlayerDie: function(player) {
		var heldFlag = this.flags.find(flag => flag.heldBy == player.id);
		if (heldFlag) {
			heldFlag.heldBy = undefined;
		}
	},
	onPlayerDc: function(player) {
		var heldFlag = this.flags.find(flag => flag.heldBy == player.id);
		if (heldFlag) {
			heldFlag.heldBy = undefined;
		}
	},
	checkGameEnd: function() {
		this.flags.forEach(flag => {
			if (flag.caps > settings.capsToWin) {
				return true;
			}
		});
		return false;
	}
}