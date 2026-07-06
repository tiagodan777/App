<?php
namespace TiagoDaniel\Validate;

class Validate {
    public static function isNumber($number, $min = 0, $max = 100) {
        return ($number >= $min && $number <= $max);
    }
    
    public static function isText($text, $min = 0, $max = 100) {
        $lenght = mb_strlen($text);
        return ($lenght >= $min && $lenght <= $max);
    }
    
    public static function isMemberId($member_id, $member_id_list) {
        foreach ($member_id_list as $member) {
            if ($member_id == $member) {
                return true;
            }
        }
        return false;
    }
    
    public static function isCategoryId($category_id, $category_id_list) {
        foreach ($category_id_list as $category) {
            if ($category_id == $category['id']) {
                return true;
            }
        }
        return false;
    }

    public static function isEmail($email) {
        return (filter_var($email, FILTER_VALIDATE_EMAIL)) ? true: false;
    }

    public static function isGenero($genero) {
        $allowed_types = ['M', 'F', 'D'];
        return in_array($genero, $allowed_types);
    }

    public static function isRole($role) {
        $allowed_types = ['member', 'imperador_supremo_universo', 'suspended'];
        return in_array($role, $allowed_types);
    }

    public static function isPassword($password)
    {
        if ( mb_strlen($password) >= 8                     // Length 8 or more chars
            and preg_match('/[A-Z]/', $password)             // Contains uppercase A-Z
            and preg_match('/[a-z]/', $password)             // Contains lowercase a-z
            and preg_match('/[0-9]/', $password)             // Contains 0-9
        ) {
            return true;                                     // Passed all tests
        }
        return false;                                      // Invalid password
    }
}

