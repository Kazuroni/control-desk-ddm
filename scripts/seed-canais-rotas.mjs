import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// ─── Campanhas — dados exatos da planilha enviada pelo usuário ─────────────────
// Nota: SIP tem solicitado="-" (não numérico), tratado como 0; saldo calculado: solicitado - alocado
const campanhas = [
  { campanha: "AD_Preventivo",              ativo: "Sim", solicitado: 0,  alocado: 0,  rotaCadastrada: "NENHUMA"     },
  { campanha: "AD_RETELL",                  ativo: "Sim", solicitado: 10, alocado: 10, rotaCadastrada: "VONEX"       },
  { campanha: "AD_VAPI",                    ativo: "Sim", solicitado: 5,  alocado: 1,  rotaCadastrada: "PONTALTECH"  },
  { campanha: "ADA_Template_Cobranca",      ativo: "Sim", solicitado: 0,  alocado: 1,  rotaCadastrada: "LCR_OLOS"   },
  { campanha: "ADA_Template_Vendas",        ativo: "Sim", solicitado: 0,  alocado: 1,  rotaCadastrada: "LCR_OLOS"   },
  { campanha: "Anima_Ativo",                ativo: "Sim", solicitado: 48, alocado: 48, rotaCadastrada: "PONTALTECH"  },
  { campanha: "Anima_Manual",               ativo: "Sim", solicitado: 5,  alocado: 5,  rotaCadastrada: "PONTALTECH"  },
  { campanha: "Ativo_olos",                 ativo: "Sim", solicitado: 4,  alocado: 0,  rotaCadastrada: "PONTALTECH"  },
  { campanha: "Campanha_WAY",               ativo: "Sim", solicitado: 2,  alocado: 0,  rotaCadastrada: "VONEX"       },
  { campanha: "Castelo_Branco",             ativo: "Sim", solicitado: 25, alocado: 25, rotaCadastrada: "GOSAT"       },
  { campanha: "Cedae",                      ativo: "Sim", solicitado: 10, alocado: 10, rotaCadastrada: "R1"          },
  { campanha: "Cedae Manual",               ativo: "Sim", solicitado: 2,  alocado: 0,  rotaCadastrada: "R1"          },
  { campanha: "Cruzeiro_Ativo",             ativo: "Sim", solicitado: 95, alocado: 95, rotaCadastrada: "PONTALTECH"  },
  { campanha: "Cruzeiro_Nao_Alo",           ativo: "Sim", solicitado: 10, alocado: 10, rotaCadastrada: "NEWVOICE"    },
  { campanha: "Cruzeiro_Manual",            ativo: "Sim", solicitado: 5,  alocado: 5,  rotaCadastrada: "PONTALTECH"  },
  { campanha: "Datora",                     ativo: "Sim", solicitado: 5,  alocado: 5,  rotaCadastrada: "NEWVOICE_BM" },
  { campanha: "Datora_Manual",              ativo: "Sim", solicitado: 0,  alocado: 2,  rotaCadastrada: "NEWVOICE_BM" },
  { campanha: "Educacional Manual",         ativo: "Sim", solicitado: 5,  alocado: 5,  rotaCadastrada: "NEWVOICE"    },
  { campanha: "Educacional Q1",             ativo: "Sim", solicitado: 15, alocado: 15, rotaCadastrada: "NEWVOICE_BM" },
  { campanha: "Educacional Q2",             ativo: "Sim", solicitado: 10, alocado: 10, rotaCadastrada: "NEWVOICE"    },
  { campanha: "Educacional Q3",             ativo: "Sim", solicitado: 8,  alocado: 8,  rotaCadastrada: "VONEX"       },
  { campanha: "Empresarial_Ativo",          ativo: "Sim", solicitado: 10, alocado: 10, rotaCadastrada: "NEWVOICE"    },
  { campanha: "Empresarial_Manual",         ativo: "Sim", solicitado: 2,  alocado: 2,  rotaCadastrada: "NEWVOICE"    },
  { campanha: "Isaac Ativo Inativo",        ativo: "Sim", solicitado: 20, alocado: 20, rotaCadastrada: "OKTOR"       },
  { campanha: "Isaac Ativo Inativo Manual", ativo: "Sim", solicitado: 2,  alocado: 2,  rotaCadastrada: "NEWVOICE"    },
  { campanha: "Isaac Inativo Manual",       ativo: "Sim", solicitado: 3,  alocado: 3,  rotaCadastrada: "NEWVOICE"    },
  { campanha: "Isaac_Ativo",                ativo: "Sim", solicitado: 28, alocado: 28, rotaCadastrada: "OKTOR"       },
  { campanha: "Isaac_Inativo",              ativo: "Sim", solicitado: 20, alocado: 20, rotaCadastrada: "OKTOR"       },
  { campanha: "Light",                      ativo: "Sim", solicitado: 10, alocado: 10, rotaCadastrada: "R1"          },
  { campanha: "Locator_CPF_Template",       ativo: "Sim", solicitado: 0,  alocado: 0,  rotaCadastrada: "LCR_OLOS"   },
  { campanha: "Locator_Template",           ativo: "Sim", solicitado: 0,  alocado: 1,  rotaCadastrada: "LCR_OLOS"   },
  { campanha: "Manual",                     ativo: "Sim", solicitado: 1,  alocado: 1,  rotaCadastrada: "NEWVOICE_BM" },
  { campanha: "Salta Educação",             ativo: "Sim", solicitado: 26, alocado: 26, rotaCadastrada: "VONEX"       },
  { campanha: "Todos Agentes (Nao Tirar)",  ativo: "Sim", solicitado: 1,  alocado: 0,  rotaCadastrada: "PONTALTECH"  },
  { campanha: "Vero_Churn",                 ativo: "Sim", solicitado: 35, alocado: 35, rotaCadastrada: "VONEX"       },
  { campanha: "Vero_Manual",                ativo: "Sim", solicitado: 0,  alocado: 0,  rotaCadastrada: "NEWVOICE_BM" },
  { campanha: "Vero_PreChurn",              ativo: "Sim", solicitado: 35, alocado: 35, rotaCadastrada: "OKTOR"       },
  { campanha: "Vero2",                      ativo: "Sim", solicitado: 0,  alocado: 0,  rotaCadastrada: "PONTALTECH"  },
  { campanha: "Vero2_20_a_44d_MGSUL",      ativo: "Sim", solicitado: 12, alocado: 12, rotaCadastrada: "VONEX"       },
  { campanha: "Vero2_20_a_44d_SPCO",       ativo: "Sim", solicitado: 9,  alocado: 9,  rotaCadastrada: "VONEX"       },
  { campanha: "Vero2_45_a_75d_MGSUL",      ativo: "Sim", solicitado: 9,  alocado: 9,  rotaCadastrada: "VONEX"       },
  { campanha: "Vero2_45_a_75d_SPCO",       ativo: "Sim", solicitado: 9,  alocado: 9,  rotaCadastrada: "VONEX"       },
  { campanha: "Vero2_76_a_120d_MGSUL",     ativo: "Sim", solicitado: 9,  alocado: 9,  rotaCadastrada: "VONEX"       },
  { campanha: "Vero2_76_a_120d_SPCO",      ativo: "Sim", solicitado: 9,  alocado: 9,  rotaCadastrada: "VONEX"       },
  { campanha: "Vero2_Manual",              ativo: "Sim", solicitado: 2,  alocado: 2,  rotaCadastrada: "VONEX"       },
  { campanha: "Way_Ura_Anima",             ativo: "Sim", solicitado: 20, alocado: 20, rotaCadastrada: "PONTALTECH"  },
  { campanha: "Way_Ura_Cruzeiro",          ativo: "Sim", solicitado: 67, alocado: 67, rotaCadastrada: "PONTALTECH"  },
  { campanha: "Way_Ura_Yduqs",            ativo: "Sim", solicitado: 28, alocado: 28, rotaCadastrada: "VONEX"       },
  { campanha: "Yduqs_Ativo",              ativo: "Sim", solicitado: 25, alocado: 25, rotaCadastrada: "VONEX"       },
  { campanha: "Yduqs_Manual",             ativo: "Sim", solicitado: 3,  alocado: 3,  rotaCadastrada: "VONEX"       },
  { campanha: "LICENÇAS",                 ativo: "Sim", solicitado: 50, alocado: 50, rotaCadastrada: "LOGIN_NOT_EXT"},
  { campanha: "IA DDM",                   ativo: "Sim", solicitado: 3,  alocado: 3,  rotaCadastrada: "RETELL"      },
  // SIP: solicitado "-" (não numérico) → 0; alocado 18; saldo = 0 - 18 = -18
  { campanha: "SIP",                      ativo: "-",   solicitado: 0,  alocado: 18, rotaCadastrada: "SIPWAY"      },
];

// ─── Rotas — dados exatos da coluna "ROTAS EXISTENTES / EM USO" ───────────────
// Número de canais atual: 724 total (conforme planilha)
// Canais Livres: 2
const rotas = [
  { nome: "VONEX",         quantidadeCanais: 194, qualidade: "ALTA",  custo: "BAIXO",         limite: null, observacao: null },
  { nome: "PONTALTECH",    quantidadeCanais: 241, qualidade: "ALTA",  custo: "BAIXO",         limite: null, observacao: "Principal rota de discagem ativa" },
  { nome: "NEWVOICE_BM",   quantidadeCanais: 23,  qualidade: "MÉDIA", custo: "ELEVADO",       limite: null, observacao: null },
  { nome: "LOGIN_NOT_EXT", quantidadeCanais: 50,  qualidade: null,    custo: null,            limite: null, observacao: "Licenças de login sem ramal externo" },
  { nome: "R1",            quantidadeCanais: 20,  qualidade: "BAIXA", custo: "MUITO ELEVADO", limite: "0",  observacao: "Usar somente quando necessário" },
  { nome: "NEWVOICE",      quantidadeCanais: 42,  qualidade: "MÉDIA", custo: "ELEVADO",       limite: null, observacao: null },
  { nome: "VAPI",          quantidadeCanais: 0,   qualidade: null,    custo: null,            limite: null, observacao: "N/A — não usar" },
  { nome: "RETELL",        quantidadeCanais: 3,   qualidade: "ALTA",  custo: "MUITO ELEVADO", limite: null, observacao: "Canais IA — custo por minuto" },
  { nome: "GOSAT",         quantidadeCanais: 25,  qualidade: null,    custo: null,            limite: null, observacao: null },
  { nome: "OKTOR",         quantidadeCanais: 103, qualidade: "ALTA",  custo: "BAIXO",         limite: null, observacao: null },
  { nome: "SIPWAY",        quantidadeCanais: 18,  qualidade: "MÉDIA", custo: "BAIXO",         limite: null, observacao: "Linha SIP dedicada" },
  { nome: "SAMIX",         quantidadeCanais: 0,   qualidade: "BAIXA", custo: "MUITO ELEVADO", limite: "0",  observacao: "N/A — uso restrito" },
  { nome: "LCR_OLOS",      quantidadeCanais: 5,   qualidade: "MÉDIA", custo: "BAIXO",         limite: null, observacao: "Localizador de CPF" },
];

// ─── Canais IA (mantidos do seed anterior) ────────────────────────────────────
const canaisIA = [
  { celula: "Cruzeiro Ativo", qtdCanais: 1, canaisName: "IA_Cruzeiro_01", qtdFluxo: 1, fluxosName: "Fluxo_Cruzeiro_Ativo" },
  { celula: "Anima Ativo",    qtdCanais: 1, canaisName: "IA_Anima_01",    qtdFluxo: 1, fluxosName: "Fluxo_Anima_Ativo"    },
  { celula: "Yduqs Ativo",    qtdCanais: 1, canaisName: "IA_Yduqs_01",    qtdFluxo: 1, fluxosName: "Fluxo_Yduqs_Ativo"    },
];

// ─── Inserção ─────────────────────────────────────────────────────────────────
console.log("Limpando tabelas...");
await conn.execute("DELETE FROM canais_rotas_campanhas");
await conn.execute("DELETE FROM canais_rotas_rotas");
await conn.execute("DELETE FROM canais_rotas_ia");

console.log(`Inserindo ${campanhas.length} campanhas...`);
for (const c of campanhas) {
  const saldo = c.solicitado - c.alocado;
  await conn.execute(
    "INSERT INTO canais_rotas_campanhas (campanha, ativo, solicitado, alocado, saldo, rotaCadastrada) VALUES (?, ?, ?, ?, ?, ?)",
    [c.campanha, c.ativo, c.solicitado, c.alocado, saldo, c.rotaCadastrada ?? null]
  );
}

console.log(`Inserindo ${rotas.length} rotas...`);
for (const r of rotas) {
  await conn.execute(
    "INSERT INTO canais_rotas_rotas (nome, quantidadeCanais, qualidade, custo, limite, observacao) VALUES (?, ?, ?, ?, ?, ?)",
    [r.nome, r.quantidadeCanais, r.qualidade ?? null, r.custo ?? null, r.limite ?? null, r.observacao ?? null]
  );
}

console.log(`Inserindo ${canaisIA.length} células IA...`);
for (const ia of canaisIA) {
  await conn.execute(
    "INSERT INTO canais_rotas_ia (celula, qtdCanais, canaisName, qtdFluxo, fluxosName) VALUES (?, ?, ?, ?, ?)",
    [ia.celula, ia.qtdCanais, ia.canaisName, ia.qtdFluxo, ia.fluxosName]
  );
}

await conn.end();
console.log("✅ Seed concluído com sucesso!");
console.log(`  Campanhas: ${campanhas.length}`);
console.log(`  Rotas: ${rotas.length}`);
console.log(`  Células IA: ${canaisIA.length}`);
console.log(`  Total canais (soma rotas): ${rotas.reduce((s, r) => s + r.quantidadeCanais, 0)}`);
