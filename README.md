# Jungle Gaming - Distributed Wagering Processor

Servico finaneiro distribuído para processamento de transações de apostas com garantias de correção financeira, proteção contra cobraças duplicadas e consistência sob múltiplas instâncias concorrentes. 

## Stack 

- Bun 1.4.0 (runtime, package manager, test runner)
- TypeScript (modo estrito)
- NestJS
- PostgreSQL
- MikroORM
- AWS SQS via LocalStack

## Setup 
\`\`\`bash
cp .env.example .env
docker compose up -d 
bun install 
\`\`\`