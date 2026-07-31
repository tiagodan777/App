<?php

declare(strict_types=1);

/**
 * Devolve o endereço do cliente sem confiar em cabeçalhos que podem ser
 * falsificados por quem faz o pedido.
 */
function enderecoCliente(): string
{
    $endereco = trim(
        (string) ($_SERVER['REMOTE_ADDR'] ?? '')
    );

    if (
        $endereco !== '' &&
        filter_var(
            $endereco,
            FILTER_VALIDATE_IP
        ) !== false
    ) {
        return $endereco;
    }

    return 'desconhecido';
}

/**
 * Oculta emails, números de telefone, UUIDs e endereços IP nos nomes dos
 * ficheiros usados pelo limitador.
 */
function chaveLimiteRequisicoes(
    string $valor
): string {
    return hash(
        'sha256',
        mb_strtolower(
            trim($valor),
            'UTF-8'
        )
    );
}

/**
 * Consome uma tentativa numa janela temporal deslizante.
 *
 * Os dados são guardados fora da pasta pública e protegidos com flock(),
 * portanto dois processos PHP não conseguem alterar o mesmo limite ao mesmo
 * tempo.
 *
 * @return array{
 *     permitido: bool,
 *     restantes: int,
 *     tentar_em: int
 * }
 */
function consumirLimiteRequisicoes(
    string $grupo,
    string $identificador,
    int $maximo,
    int $janelaSegundos
): array {
    if (
        $maximo < 1 ||
        $janelaSegundos < 1
    ) {
        throw new InvalidArgumentException(
            'O limite e a janela temporal têm de ser superiores a zero.'
        );
    }

    try {
        $diretorio =
            APP_ROOT .
            '/var/rate-limit';

        if (
            !is_dir($diretorio) &&
            !mkdir(
                $diretorio,
                0750,
                true
            ) &&
            !is_dir($diretorio)
        ) {
            throw new RuntimeException(
                'Não foi possível criar a pasta do limitador.'
            );
        }

        $chave = hash(
            'sha256',
            trim($grupo) .
            "\0" .
            trim($identificador)
        );

        $ficheiro =
            $diretorio .
            '/' .
            $chave .
            '.json';

        $handle = fopen(
            $ficheiro,
            'c+'
        );

        if ($handle === false) {
            throw new RuntimeException(
                'Não foi possível abrir o estado do limitador.'
            );
        }

        try {
            if (!flock($handle, LOCK_EX)) {
                throw new RuntimeException(
                    'Não foi possível bloquear o estado do limitador.'
                );
            }

            rewind($handle);

            $conteudo =
                stream_get_contents($handle);

            $dados =
                is_string($conteudo) &&
                $conteudo !== ''
                    ? json_decode(
                        $conteudo,
                        true
                    )
                    : [];

            $tentativas =
                is_array($dados) &&
                isset($dados['tentativas']) &&
                is_array($dados['tentativas'])
                    ? $dados['tentativas']
                    : [];

            $agora = time();

            $inicioJanela =
                $agora -
                $janelaSegundos;

            $tentativas = array_values(
                array_filter(
                    $tentativas,
                    static fn($momento): bool =>
                        is_int($momento) &&
                        $momento > $inicioJanela
                )
            );

            $permitido =
                count($tentativas) <
                $maximo;

            if ($permitido) {
                $tentativas[] = $agora;
            }

            $restantes = max(
                0,
                $maximo -
                count($tentativas)
            );

            $tentarEm = 0;

            if (
                !$permitido &&
                $tentativas !== []
            ) {
                $tentarEm = max(
                    1,
                    (
                        (int) $tentativas[0] +
                        $janelaSegundos
                    ) -
                    $agora
                );
            }

            $novoConteudo = json_encode(
                [
                    'tentativas' =>
                        $tentativas
                ],
                JSON_THROW_ON_ERROR
            );

            rewind($handle);

            if (!ftruncate($handle, 0)) {
                throw new RuntimeException(
                    'Não foi possível limpar o estado do limitador.'
                );
            }

            if (
                fwrite(
                    $handle,
                    $novoConteudo
                ) === false
            ) {
                throw new RuntimeException(
                    'Não foi possível guardar o estado do limitador.'
                );
            }

            fflush($handle);
            @chmod($ficheiro, 0640);
            flock($handle, LOCK_UN);

            limparLimitesRequisicoesAntigos();

            return [
                'permitido' =>
                    $permitido,

                'restantes' =>
                    $restantes,

                'tentar_em' =>
                    $tentarEm
            ];
        } finally {
            fclose($handle);
        }
    } catch (Throwable $erro) {
        error_log(
            '[rate-limit] ' .
            $erro->getMessage()
        );

        /*
         * Uma falha no limitador fica registada, mas não deixa a aplicação
         * inteira indisponível.
         */
        return [
            'permitido' => true,
            'restantes' => $maximo,
            'tentar_em' => 0
        ];
    }
}

function minutosParaTentarNovamente(
    int $segundos
): int {
    return max(
        1,
        (int) ceil(
            $segundos / 60
        )
    );
}

/**
 * Remove periodicamente estados antigos para a pasta não crescer sem limite.
 * A limpeza é oportunista, limitada e nunca percorre mais de 250 ficheiros.
 */
function limparLimitesRequisicoesAntigos(
    int $idadeMaximaSegundos = 86400
): void {
    if ($idadeMaximaSegundos < 1) {
        return;
    }

    try {
        if (random_int(1, 100) !== 1) {
            return;
        }

        $diretorio =
            APP_ROOT .
            '/var/rate-limit';

        if (!is_dir($diretorio)) {
            return;
        }

        $limite =
            time() -
            $idadeMaximaSegundos;

        $vistos = 0;

        $ficheiros =
            new DirectoryIterator(
                $diretorio
            );

        foreach (
            $ficheiros as $ficheiro
        ) {
            if (++$vistos > 250) {
                break;
            }

            if (
                !$ficheiro->isFile() ||
                $ficheiro->getExtension() !== 'json' ||
                $ficheiro->getMTime() >= $limite
            ) {
                continue;
            }

            @unlink(
                $ficheiro->getPathname()
            );
        }
    } catch (Throwable $erro) {
        error_log(
            '[rate-limit-cleanup] ' .
            $erro->getMessage()
        );
    }
}