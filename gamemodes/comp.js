function getPlayersInTeam(teamId) {
	return players.filter(player => player.team == teamId);
}
module.exports = {
	name: 'comp',
	settingsOverrides: {
		teamMode: true,
		teams: 3,
		lives: 1,
		killsToWin: 1
	},
	onInit: function() {
		var specTeam = teams.find(team => getPlayersInTeam(team.id) > 1);
		if(!specTeam){
			specTeam = teams.random();
		}
		getPlayersInTeam(specTeam.id).forEach(player => {
			player.conn.emit('game_event', {
				type: 'set_state',
				state: 'spectator'
			});
		});
	}
}
