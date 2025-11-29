# Extrator de Dados PDF

Uma aplicação web moderna para extrair dados estruturados de arquivos PDF usando OCR (Optical Character Recognition) e preencher automaticamente arquivos CSV com os dados extraídos.

## 📋 Descrição

Esta ferramenta permite extrair informações de tabelas em PDFs (especialmente PDFs escaneados ou baseados em imagens) usando tecnologia OCR e preencher automaticamente arquivos CSV com os dados encontrados. Ideal para digitalização de documentos e automação de processos de entrada de dados.

## ✨ Funcionalidades

- **Extração de PDF com OCR**: Processa PDFs usando Tesseract.js para extrair texto de documentos escaneados
- **Análise Inteligente de Dados**: Identifica e extrai automaticamente:
  - ID da amostra
  - Sexo (M/F/N)
  - Idade
  - Nome
- **Preenchimento Automático de CSV**: Preenche automaticamente arquivos CSV com os dados extraídos
- **Edição Inline**: Permite editar dados diretamente na tabela antes de exportar
- **Interface Moderna**: Design responsivo e intuitivo com feedback visual
- **Visualização de Texto Bruto**: Permite visualizar o texto extraído do PDF para verificação
- **Progresso em Tempo Real**: Mostra o progresso do processamento do PDF

## 🚀 Como Usar

### 1. Extrair Dados do PDF

1. Clique em "Selecionar Arquivo PDF"
2. Escolha o arquivo PDF que contém os dados
3. Aguarde o processamento (o OCR pode levar alguns segundos)
4. Visualize os dados extraídos na tabela

### 2. Preencher CSV

1. Clique em "Selecionar Arquivo CSV"
2. Escolha o arquivo CSV que deseja preencher
3. Certifique-se de que o CSV contém uma coluna de ID (ex: "ID amost.", "ID", "Id", etc.)
4. Clique em "Processar e Baixar CSV"
5. O arquivo preenchido será baixado automaticamente

### 3. Editar Dados

- Clique em qualquer célula da tabela (exceto a coluna #) para editar
- Pressione Enter para confirmar a edição
- Os dados editados serão salvos automaticamente

## 🛠️ Tecnologias Utilizadas

- **HTML5**: Estrutura da aplicação
- **CSS3**: Estilização moderna com variáveis CSS e design responsivo
- **JavaScript (Vanilla)**: Lógica da aplicação
- **PDF.js**: Biblioteca para processamento de PDFs
- **Tesseract.js**: Motor OCR para reconhecimento de texto em imagens
- **Font Awesome**: Ícones

## 📁 Estrutura do Projeto

```
Ane/
├── index.html      # Estrutura HTML da aplicação
├── script.js       # Lógica JavaScript (classes e funções)
├── style.css       # Estilos CSS
└── README.md       # Documentação do projeto
```

## 🏗️ Arquitetura do Código

O código está organizado em classes com responsabilidades bem definidas:

- **`PDFProcessor`**: Processa arquivos PDF e extrai texto usando OCR
- **`DataExtractor`**: Extrai dados estruturados do texto usando expressões regulares
- **`TableRenderer`**: Renderiza a interface de tabela e gerencia edições
- **`CSVProcessor`**: Processa arquivos CSV e preenche com dados extraídos
- **`UIManager`**: Gerencia interações da interface e coordena os componentes
- **`Utils`**: Funções utilitárias reutilizáveis
- **`Constants`**: Constantes centralizadas (padrões regex, mensagens, configurações)

## ⚙️ Configurações

As configurações podem ser ajustadas no objeto `Constants.CONFIG`:

```javascript
CONFIG: {
  OCR_LANGUAGE: 'por',      // Idioma do OCR (português)
  OCR_SCALE: 2.0,           // Escala para renderização do PDF
  MAX_LOOKAHEAD: 30,        // Máximo de linhas para buscar dados
  BACKUP_LOOKAHEAD: 25,     // Lookahead para busca de backup
  ID_DIGITS: 5              // Número de dígitos do ID para matching
}
```

## 📝 Formato de Dados Esperado

O extrator procura por padrões no formato:

```
[sequência] [ID] | [Sexo] | [Idade]
[Nome]
```

Exemplo:
```
1 12345 | M | 25
João Silva
```

## 🔍 Colunas CSV Suportadas

O sistema procura automaticamente por colunas com os seguintes nomes:

- **ID**: `ID amost.`, `ID`, `Id`, `id`, `ID amostra`, `ID amostra.`
- **Nome**: Qualquer coluna contendo "nome" (case-insensitive)
- **Sexo**: Qualquer coluna contendo "sexo" (case-insensitive)
- **Idade**: Qualquer coluna contendo "idade" (case-insensitive)

## 🌐 Compatibilidade

- Navegadores modernos (Chrome, Firefox, Safari, Edge)
- Suporte a dispositivos móveis (design responsivo)
- Funciona completamente no cliente (sem necessidade de servidor)

## 📦 Dependências Externas

As seguintes bibliotecas são carregadas via CDN:

- **PDF.js** (v3.11.174): `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js`
- **Tesseract.js** (v5): `https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js`
- **Font Awesome** (v6.4.0): `https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css`

## 🎨 Características de Design

- Design moderno com gradientes e animações suaves
- Suporte a modo escuro (baseado nas preferências do sistema)
- Interface responsiva para diferentes tamanhos de tela
- Feedback visual claro para todas as ações
- Indicadores de progresso durante o processamento

## ⚠️ Limitações

- O processamento OCR pode ser lento para PDFs grandes
- A precisão do OCR depende da qualidade do PDF original
- Requer conexão com internet para carregar as bibliotecas externas
- Funciona melhor com PDFs que contêm tabelas bem formatadas

## 🔧 Melhorias Futuras

- [ ] Suporte para múltiplos idiomas de OCR
- [ ] Exportação para outros formatos (Excel, JSON)
- [ ] Histórico de processamentos
- [ ] Validação de dados mais robusta
- [ ] Suporte para upload de múltiplos arquivos
- [ ] Cache de dados processados

## 📄 Licença

Este projeto está disponível para uso livre.

## 👤 Autor

Desenvolvido para facilitar a extração e processamento de dados de documentos PDF.

---

**Nota**: Esta aplicação processa todos os dados localmente no navegador. Nenhum dado é enviado para servidores externos, garantindo privacidade e segurança.

