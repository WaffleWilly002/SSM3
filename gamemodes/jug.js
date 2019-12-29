module.exports = {
	name: 'jug',
	net: undefined,
	/*jugGun: {
		bullet: {
			damage: 10,
			speed: 10,
			step: 1,
			lifeTime: 140,
			explosive: false,
			fireTick: 0
		},
		barrel: {
			len: 25,
			color: {
				r: 0,
				g: 51,
				b: 51
			}
		},
		playerMod: {
			scl: 1,
			speed: 2.5,
			drawLaser: true,
			hpMax: 1000,
			bodyArmor: 0.5,
			regen: 1000,
			regenTime: 5
		},
		price: 0,
		fireRate: 0,
		reloadTime: 200,
		pellets: 0,
		canReload: true,
		hitsWalls: true,
		canSpawn: false,
		headshot: 0.05,
		magSize: 100,
		spread: 10,
		rarity: 0,
		symbol: '-',
		type: 'auto',
		name: 'jugGun'
	},*/
	settingsOverrides: {
		teamMode: true,
		teams: 2
	},
	onInit: function() {
		var teamSums = teams.map(team => {
			return {
				id: team.id,
				val: 0
			};
		});
		players.forEach(player => {
			player.isJug = false;
			teams.forEach((team, idx) => {
				if (team.id == player.team) {
					teamSums[idx].val++;
				}
			});
		});
		teamSums.sort((a, b) => a.val - b.val);
		var jugTeam = teamSums[0].id;
		players.filter(p => p.team == jugTeam).forEach(player => {
			player.conn.emit('game_event', {
				type: 'set_gun',
				gun: Guns['jugGun']
			});
			player.isJug = true;
			player.canPickUp = false;
		});
	},
	onPlayerDie: function(player) {
		if (player.isJug) {
			player.conn.emit('game_event', {
				type: 'set_state',
				state: 'spectator'
			});
		}
	},
	checkGameEnd: function() {
		return players.filter(p => p.isJug && !p.dead).length == 0;
	}
}