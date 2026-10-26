const fs=require('node:fs'),path=require('node:path'),{DatabaseSync}=require('node:sqlite');
const root=path.resolve(__dirname,'..');
function createDatabase(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(fs.readFileSync(path.join(root,'drizzle/0000_sync.sql'),'utf8'));
 const db={sqlite,beforeLookup:null,withSession(){return this;},prepare(sql){const statement={values:[],bind(...values){this.values=values;return this;},async first(){return sqlite.prepare(sql).get(...this.values)||null;},async all(){if(sql.startsWith('SELECT event_id')&&db.beforeLookup){const hook=db.beforeLookup;db.beforeLookup=null;await hook();}return{results:sqlite.prepare(sql).all(...this.values),success:true};},async run(){const result=sqlite.prepare(sql).run(...this.values);return{success:true,meta:{changes:Number(result.changes)}};},_sql:sql};return statement;},async batch(statements){sqlite.exec('BEGIN');try{const results=statements.map(s=>{const result=sqlite.prepare(s._sql).run(...s.values);return{success:true,meta:{changes:Number(result.changes)}};});sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};return db;
}
async function loadWorker(){const source=fs.readFileSync(path.join(root,'dist/server/index.js'),'utf8');return(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;}
module.exports={root,createDatabase,loadWorker};
