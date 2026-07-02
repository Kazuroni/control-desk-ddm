import { createConnection } from "mysql2/promise";
import { readFileSync } from "fs";

const data = JSON.parse(readFileSync("/home/ubuntu/dimensionamento_full.json", "utf-8"));

const conn = await createConnection(process.env.DATABASE_URL);

// Limpa a tabela antes de re-seed
await conn.execute("DELETE FROM dimensionamento");

let inserted = 0;
for (const op of data) {
  await conn.execute(
    `INSERT INTO dimensionamento 
      (nome, login, loginOlos, email, supervisor, admissao, nascimento, cpf, funcao, cargo, departamento, uf, status, discador, celula, skill, turno, escalaHora, escala, entrada, saida, entradaS, saidaS)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      op.nome || null,
      op.login || null,
      op.loginOlos || null,
      op.email || null,
      op.supervisor || null,
      op.admissao || null,
      op.nascimento || null,
      op.cpf || null,
      op.funcao || null,
      op.cargo || null,
      op.departamento || null,
      op.uf || null,
      op.status || "ATIVO",
      op.discador || null,
      op.celula || null,
      op.skill || null,
      op.turno || null,
      op.escalaHora || null,
      op.escala || null,
      op.entrada || null,
      op.saida || null,
      op.entradaS || null,
      op.saidaS || null,
    ]
  );
  inserted++;
}

console.log(`Inseridos ${inserted} operadores no banco de dados.`);
await conn.end();
