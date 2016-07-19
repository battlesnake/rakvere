const schema = {
	object: {
		$abstract: true,
		creator_id: '>user?',
		created: 'timestamp, =current_timestamp',
		updated: 'timestamp, =current_timestamp, +=current_timestamp',
		deleted: 'boolean, =true, index',
		name: 'varchar(255)',
		description: 'text, =""'
	},
	content: {
		$abstract: true,
		$inherits: 'object',
		type: 'varchar(20), index',
		creator_id: '>user',
		snippet: 'text',
		content: 'longtext',
		view_count: 'int, =0'
	},
	user: {
		$inherits: 'object',
		name: 'varchar(40), unique',
		passhash: 'tinyblob?',
		display_name: 'varchar(40), unique',
		email: 'varchar(200), unique',
		verified: 'boolean, =false, index',
		birthday: 'datetime?, index',
		github: 'varchar(200)',
		devart: 'varchar(200)',
		twitter: 'varchar(200)',
		linkedin: 'varchar(200)'
	},
	group: {
		$inherits: 'object'
	},
	group_user: {
		group_id: '>group',
		user_id: '>user',
		role: 'varchar(20)'
	},
	session: {
		user_id: '>user',
		started: 'timestamp, =current_timestamp',
		expires: 'datetime',
		active: 'boolean, index'
	},
	post: {
		$inherits: 'object',
		parent_post_id: '>post?',
		sticky: 'boolean, =false',
		is_history: 'boolean, =false'
	},
	media: {
		$inherits: 'object',
		content: 'longblob'
	},
	post_media: {
		post_id: '>post',
		media_id: '>media'
	}
};

module.exports = schema;
