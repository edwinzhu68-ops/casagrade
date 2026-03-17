const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("./lottery.db");
db.all("SELECT name FROM sqlite_master WHERE type=\"table\"", [], (err, rows) => {
  console.log(JSON.stringify(rows, null, 2));
  db.close();
});
