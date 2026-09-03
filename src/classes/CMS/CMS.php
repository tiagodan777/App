<?php
namespace App\CMS;

class CMS {
    protected $db = null;
    private $member = null;
    private $hobbie = null;
    private $notification = null;
    private $cookie = null;
    private $token = null;
    private $opinion = null;
    private $follow = null;
    private $content = null;
    private $session = null;
    private $image = null;
    private $location = null;
    private $profileAccess = null;
    private $memberConnection = null;
    private $pushNotification = null;
    private $pushProvider = null;
    private $nearbyPresenceNotification = null;
    private array $pushConfig = [];

    public function __construct($dsn, $username, $password, array $pushConfig = [])
    {
        $this->db = new Database($dsn, $username, $password);
        $this->pushConfig = $pushConfig;
    }

    public function getMember() {
        if ($this->member === null) {
            $this->member = new Member($this->db);
        }
        return $this->member;
    }

    public function getHobbie() {
        if ($this->hobbie === null) {
            $this->hobbie = new Hobbie($this->db);
        }
        return $this->hobbie;
    }

    /*
    public function getNotification() {
        if ($this->notification === null) {
            $this->notification = new Notification($this->db);
        }
        return $this->notification;
    }*/

    
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

    /*
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
    }*/

    public function getSession() {
        if ($this->session === null) {
            $this->session = new Session($this->db);
        }
        return $this->session;
    }

    public function getImage() {
        if ($this->image === null) {
            $this->image = new Image($this->db);
        }
        return $this->image;
    }

    public function getLocation() {
        if ($this->location === null) {
            $this->location = new Location($this->db);
        }
        return $this->location;
    }

    public function getProfileAccess() {
        if ($this->profileAccess === null) {
            $this->profileAccess = new ProfileAccess($this->db);
        }
        return $this->profileAccess;
    }

    public function getMemberConnection() {
        if ($this->memberConnection === null) {
            $this->memberConnection = new MemberConnection($this->db);
        }
        return $this->memberConnection;
    }

    public function getPushNotification() {
        if ($this->pushNotification === null) {
            $this->pushNotification = new PushNotification($this->db);
        }
        return $this->pushNotification;
    }

    public function getPushProvider() {
        if ($this->pushProvider === null) {
            $this->pushProvider = new PushProvider($this->pushConfig);
        }
        return $this->pushProvider;
    }

    public function getNearbyPresenceNotification() {
        if ($this->nearbyPresenceNotification === null) {
            $this->nearbyPresenceNotification = new NearbyPresenceNotification(
                $this->db,
                $this->getPushNotification()
            );
        }
        return $this->nearbyPresenceNotification;
    }

    public function getDatabase() {
        return $this->db;
    }
}