<?php
namespace App\CMS;

class CMS {
    protected $db = null;
    private $member = null;
    private $message = null;
    private $messageAccess = null;
    private $notification = null;
    private $safety = null;
    private $hobbie = null;
    private $cookie = null;
    private $token = null;
    private $session = null;
    private $image = null;
    private $location = null;
    private $profileAccess = null;
    private $memberConnection = null;
    private $pushNotification = null;
    private $pushProvider = null;
    private $nearbyPresenceNotification = null;
    private $todayStatus = null;
    private array $pushConfig = [];

    public function __construct($dsn, $username, $password, array $pushConfig = []) {
        $this->db = new Database($dsn, $username, $password);
        $this->pushConfig = $pushConfig;
    }

    public function getMember() {
        return $this->member ??= new Member($this->db);
    }

    public function getHobbie() {
        return $this->hobbie ??= new Hobbie($this->db);
    }

    public function getCookie() {
        return $this->cookie ??= new Cookie($this->db);
    }

    public function getToken() {
        return $this->token ??= new Token($this->db);
    }

    public function getSession() {
        return $this->session ??= new Session($this->db);
    }

    public function getImage() {
        return $this->image ??= new Image($this->db);
    }

    public function getLocation() {
        return $this->location ??= new Location($this->db);
    }

    public function getProfileAccess() {
        return $this->profileAccess ??= new ProfileAccess($this->db);
    }

    public function getMemberConnection() {
        return $this->memberConnection ??= new MemberConnection($this->db);
    }

    public function getPushNotification() {
        return $this->pushNotification ??= new PushNotification($this->db);
    }

    public function getPushProvider() {
        return $this->pushProvider ??= new PushProvider($this->pushConfig);
    }

    public function getNearbyPresenceNotification() {
        return $this->nearbyPresenceNotification ??= new NearbyPresenceNotification($this->db, $this->getPushNotification());
    }

    public function getTodayStatus() {
        return $this->todayStatus ??= new TodayStatus($this->db);
    }

    public function getDatabase() {
        return $this->db;
    }

    public function getMessage(): Message {
        return $this->message ??= new Message($this->db);
    }

    public function getMessageAccess(): MessageAccess {
        return $this->messageAccess ??= new MessageAccess($this->db);
    }

    public function getNotification(): Notification {
        return $this->notification ??= new Notification($this->db);
    }

    public function getSafety(): Safety {
        return $this->safety ??= new Safety($this->db);
    }
}
