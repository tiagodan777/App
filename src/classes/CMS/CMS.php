<?php
namespace App\CMS;

class CMS {
    protected $db = null;
    private $member = null;
    private $notification = null;
    private $cookie = null;
    private $token = null;
    private $opinion = null;
    private $follow = null;
    private $content = null;
    private $session = null;

    public function __construct($dsn, $username, $password)
    {
        $this->db = new Database($dsn, $username, $password);        
    }

    public function getMember() {
        if ($this->member === null) {
            $this->member = new Member($this->db);
        }
        return $this->member;
    }

    public function getNotification() {
        if ($this->notification === null) {
            $this->notification = new Notification($this->db);
        }
        return $this->notification;
    }

    public function getCookie() {
        if ($this->cookie === null) {
            $this->cookie = new Cookie($this->db);
        }
        return $this->cookie;
    }

    public function getToken() {
        if ($this->token === null) {
            $this->token = new Token($this->db);
        }
        return $this->token;
    }

    public function getOpinion() {
        if ($this->opinion === null) {
            $this->opinion = new Opinion($this->db);
        }
        return $this->opinion;
    }

    public function getFollow() {
        if ($this->follow === null) {
            $this->follow = new Follow($this->db, null);
        }
        return $this->follow;
    }

    public function getContent() {
        if ($this->content === null) {
            $this->content = new Content($this->db);
        }
        return $this->content;
    }

    public function getSession() {
        if ($this->session === null) {
            $this->session = new Session($this->db);
        }
        return $this->session;
    }

    public function getDatabase() {
        return $this->db;
    }
}