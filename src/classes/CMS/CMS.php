<?php

namespace App\CMS;

class CMS
{
    protected $db = null;

    private $member = null;
    private $hobbie = null;
    private $cookie = null;
    private $token = null;
    private $session = null;
    private $image = null;
    private $location = null;
    private $profileAccess = null;

    public function __construct($dsn, $username, $password)
    {
        $this->db = new Database($dsn, $username, $password);
    }

    public function getMember()
    {
        if ($this->member === null) {
            $this->member = new Member($this->db);
        }

        return $this->member;
    }

    public function getHobbie()
    {
        if ($this->hobbie === null) {
            $this->hobbie = new Hobbie($this->db);
        }

        return $this->hobbie;
    }

    public function getCookie()
    {
        if ($this->cookie === null) {
            $this->cookie = new Cookie($this->db);
        }

        return $this->cookie;
    }

    public function getToken()
    {
        if ($this->token === null) {
            $this->token = new Token($this->db);
        }

        return $this->token;
    }

    public function getSession()
    {
        if ($this->session === null) {
            $this->session = new Session($this->db);
        }

        return $this->session;
    }

    public function getImage()
    {
        if ($this->image === null) {
            $this->image = new Image($this->db);
        }

        return $this->image;
    }

    public function getLocation()
    {
        if ($this->location === null) {
            $this->location = new Location($this->db);
        }

        return $this->location;
    }

    public function getProfileAccess()
    {
        if ($this->profileAccess === null) {
            $this->profileAccess = new ProfileAccess($this->db);
        }

        return $this->profileAccess;
    }

    public function getDatabase()
    {
        return $this->db;
    }
}