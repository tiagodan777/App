<?php
namespace App\Validate;

class Validate
{
    public const MINIMUM_AGE = 18;
    public const ADULT_GROUP = '18+';

    public static function isNumber($number, $min = 0, $max = 100)
    {
        return $number >= $min && $number <= $max;
    }

    public static function isText($text, $min = 0, $max = 100)
    {
        $length = mb_strlen($text);

        return $length >= $min && $length <= $max;
    }

    public static function isMemberId($member_id, $member_id_list)
    {
        foreach ($member_id_list as $member) {
            if ($member_id == $member) {
                return true;
            }
        }

        return false;
    }

    public static function isCategoryId($category_id, $category_id_list)
    {
        foreach ($category_id_list as $category) {
            if ($category_id == $category['id']) {
                return true;
            }
        }

        return false;
    }

    public static function isEmail($email)
    {
        return filter_var($email, FILTER_VALIDATE_EMAIL) !== false;
    }

    public static function isGenero($genero)
    {
        return in_array($genero, ['M', 'F', 'D'], true);
    }

    public static function isRole($role)
    {
        return in_array(
            $role,
            [
                'member',
                'imperador_supremo_universo',
                'suspended'
            ],
            true
        );
    }

    public static function isPassword($password)
    {
        return mb_strlen($password) >= 8
            && preg_match('/[A-Z]/', $password)
            && preg_match('/[a-z]/', $password)
            && preg_match('/[0-9]/', $password);
    }

    public static function isPhone($phone): bool
    {
        $phone = trim((string) $phone);

        if (!preg_match('/^\+?[0-9\s().-]+$/', $phone)) {
            return false;
        }

        $digits = preg_replace('/\D+/', '', $phone);
        $length = strlen($digits);

        return $length >= 7 && $length <= 15;
    }

    public static function age(string $birthDate): ?int
    {
        $birthDate = trim($birthDate);

        if ($birthDate === '') {
            return null;
        }

        $date = \DateTimeImmutable::createFromFormat(
            '!Y-m-d',
            $birthDate,
            new \DateTimeZone('UTC')
        );

        $errors = \DateTimeImmutable::getLastErrors();

        if (
            !$date
            || (
                $errors !== false
                && (
                    ($errors['warning_count'] ?? 0) > 0
                    || ($errors['error_count'] ?? 0) > 0
                )
            )
            || $date->format('Y-m-d') !== $birthDate
        ) {
            return null;
        }

        $today = new \DateTimeImmutable(
            'today',
            new \DateTimeZone('UTC')
        );

        if ($date > $today) {
            return null;
        }

        return $date->diff($today)->y;
    }

    public static function isAdult(string $birthDate): bool
    {
        $age = self::age($birthDate);

        return $age !== null
            && $age >= self::MINIMUM_AGE;
    }

    public static function ageGroup(string $birthDate): ?string
    {
        return self::isAdult($birthDate)
            ? self::ADULT_GROUP
            : null;
    }

    public static function adultSqlCondition(string $alias): string
    {
        if (preg_match('/^[a-z_][a-z0-9_]*$/i', $alias) !== 1) {
            throw new \InvalidArgumentException(
                'O alias SQL não é válido.'
            );
        }

        return self::adultSqlColumnCondition(
            $alias . '.nascimento'
        );
    }

    public static function adultSqlColumnCondition(string $column): string
    {
        if (
            preg_match(
                '/^[a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)?$/i',
                $column
            ) !== 1
        ) {
            throw new \InvalidArgumentException(
                'A coluna SQL não é válida.'
            );
        }

        return sprintf(
            "(%s IS NOT NULL AND %s >= '1900-01-01' AND %s <= DATE_SUB(UTC_DATE(), INTERVAL %d YEAR))",
            $column,
            $column,
            $column,
            self::MINIMUM_AGE
        );
    }
}