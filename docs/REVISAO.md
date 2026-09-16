# Revisão da Margot

Esta entrega reorganiza o código para manutenção, usando a arquitetura do Lykrr como referência. Mantém as rotas, os contratos entre PHP e JavaScript, o aspeto da interface e as integrações nativas existentes. Os problemas funcionais identificados abaixo ficam explicitamente registados para a fase seguinte.

## Alterações principais

- `public/index.php` ficou dedicado à resolução da rota; CSRF e limites de pedidos passaram para `src/request-guards.php`.
- Respostas JSON, redirecionamentos, autenticação básica e leitura de Authorization ficaram em `src/http.php`.
- As páginas deixaram de conter SQL direto. Mensagens, notificações e segurança ganharam classes próprias, seguindo o padrão já usado pelo Lykrr.
- `messages.php` passou a coordenar o pedido. Consultas, acesso à conversa e uploads ficaram em `Message`, `MessageAccess` e `MessageMedia`.
- A criação automática de tabelas saiu de mensagens, ligações, proximidade e estado “Hoje”. O esquema fornecido já contém essas tabelas.
- O WebSocket foi dividido em ciclo de ligação/autenticação, chat, ligações/Heys e descoberta/localização. Foram retirados blocos `finally` que só atribuíam `null` a variáveis locais.
- O JavaScript do WebSocket foi separado do rastreio de localização e dos avisos. O chat ganhou um módulo de reações; o perfil separa galeria, Hey e ligação; as peças de roupa têm um módulo próprio.
- O formulário de conta usa 11 secções em `templates/account/`. O CSS do perfil foi separado em cinco ficheiros, mantendo a ordem original das regras.
- `AppDelegate.swift` ficou dedicado ao ciclo de vida da app. A coordenação do relançamento por localização passou para `LocationRelaunchCoordinator.swift`.
- Os dois XML iOS idênticos, `config 2.xml` e `config 3.xml`, foram consolidados em `config.xml`, nome que o projeto Xcode já referenciava.
- PHP, JavaScript, CSS, templates, Swift e Java receberam formatação mais compacta. Foram retirados métodos mortos identificados sem chamadas no projeto e comentários de implementações antigas.

Foram preservadas verificações que protegem dados ou permitem recuperar de falhas reais: sessões, CSRF, permissões, idade, bloqueios, autoria de mensagens, validação de uploads, transações, autenticação WebSocket e falhas de rede/push. Os mecanismos que evitam mensagens duplicadas, acesso entre contas e interrupção de workers continuam a ter uma função concreta.

## Verificações realizadas

- Sintaxe de todos os ficheiros PHP próprios; carregamento das classes CMS e compilação dos 31 templates Twig.
- 99 verificações PHP: mensagens, histórico, leituras, reações, ocultação de conversas, autoria, bloqueios, denúncias, notificações, estado “Hoje”, tokens e acesso ao perfil.
- Os mesmos testes incluem ligações WebSocket simuladas: origem, autenticação, token de utilização única, identidade, proximidade, criação/remoção de ligações, modo invisível e propagação de mensagens/reações/leituras/eliminação.
- 93 verificações JavaScript: sintaxe, localização no browser e Android simulados, autorização, limitação de atualizações, paragem, deduplicação de avisos e geração dos ícones de roupa.
- Renderização e comparação do DOM dos 20 templates originais em dois estados: visitante e membro. Não foram encontradas diferenças no conteúdo e atributos, descontando os elementos de carregamento de CSS/JS e espaços de formatação.
- Comparação estrutural das 17 folhas CSS originais, incluindo a ordem da folha do perfil depois de reunir os seus cinco ficheiros. Alterações apenas de formatação.
- Reações agrupadas, badges e ícones também exercitados com jQuery num DOM simulado.
- Sintaxe Swift e formato do projeto Xcode validados. As diferenças de tokens Swift/Java foram verificadas: formatação, imports, vírgulas finais e a extração do coordenador iOS.
- Confirmado que a aplicação não contém DDL e que as páginas não executam consultas diretamente. O inventário compara os ficheiros com o ZIP original.

Os testes PHP foram executados em PHP 8.3.33, usando SQLite temporário com adaptação de algumas expressões MariaDB. Não foram realizados testes contra a base MariaDB real, transações concorrentes no servidor, envio real de email/APNs/FCM, uploads HTTP reais nem testes em dispositivos. A comparação de DOM não equivale a um teste visual completo no browser. Não foi feita uma compilação completa de iOS/Android. Não foi efetuado qualquer deploy.

## Problemas existentes para a próxima fase

| Tema | Evidência e impacto |
| --- | --- |
| Distância de descoberta | `ProximityConfig::RADIUS_METRES` está em `1600000` (1 600 km), enquanto a interface fala em 100 metros. O valor original foi preservado; é necessário decidir o raio pretendido. |
| Género | O formulário e `Validate::isGenero()` usam `M`, `F`, `D`; o SQL fornecido define `enum('M','F','P')`. A terceira opção pode falhar ao guardar. É necessário alinhar dados, formulário e validação. |
| Eliminação de conta | `Member::delete()` não elimina explicitamente todos os registos das tabelas mais recentes que não têm uma chave estrangeira com eliminação em cascata, incluindo ligações, estado “Hoje”, estado da app e tabelas auxiliares de mensagens. Pode deixar registos órfãos. |

Não se deve interpretar a passagem dos testes como resolução destes problemas ou garantia de ausência de outros erros. Esta entrega fornece uma base mais legível para os corrigir.

## Dependências e ficheiros originais

As bibliotecas em `vendor/`, jQuery, imagens, ícones, certificados/configurações nativas e ficheiros de versões das dependências foram conservados. Não é necessário substituir bibliotecas por versões novas para esta reorganização. O ZIP inclui o projeto completo; histórico Git, `node_modules` e metadados de arquivo do macOS não fazem parte da entrega. Os três ficheiros fornecidos originalmente não foram modificados.
