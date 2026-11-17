<?php
declare(strict_types=1);

namespace App\CMS;

/** Short process-local history; never extrapolated, persisted or exposed to clients. */
final class TemporalProximity {
    public const MAX_SKEW_SECONDS = 25.0;
    public const MAX_SEGMENT_SECONDS = 20.0;
    // Includes a bounded phase adjustment from the standard Android 30 s request.
    // This is motion detection only; long gaps are never interpolated.
    public const MAX_MOTION_OBSERVATION_SECONDS = 80.0;
    public const MAX_MOVING_AGE_SECONDS = 30.0;
    // An actual common 40 s capture may need up to 25 s for delivery and polling.
    // This does not renew its timestamp or permit interpolation over a long gap.
    public const MAX_ALIGNED_AGE_SECONDS = 65.0;
    public const MAX_CAPTURE_SKEW_SECONDS = 1.5;
    private array $tracks = [];

    public function observe(string $id, array $fix): void {
        $track = $this->tracks[$id] ?? null;
        if ($track !== null && ($track['revision'] !== ($fix['revision'] ?? 0))) {
            $this->forget($id);
            $track = null;
        }
        if ($track === null && count($this->tracks) >= 10000) return;
        $points = $track['points'] ?? [];
        $last = $points ? $points[count($points)-1] : null;
        if ($last !== null && $fix['updated_at'] <= $last['updated_at']) return;
        $moving = $track['moving'] ?? false;
        $alignedUntil = $track['aligned_until'] ?? 0;
        if ($last !== null) {
            $dt = $fix['updated_at'] - $last['updated_at'];
            // A long outage cannot establish that a previously moving user stopped.
            if ($dt > 0 && self::precise($last) && self::precise($fix)) {
                $distance = self::metres($last, $fix);
                if ($distance < max(20, $last['accuracy'] + $fix['accuracy'])) $moving = false;
                elseif ($dt <= self::MAX_MOTION_OBSERVATION_SECONDS) $moving = $distance/$dt >= 3;
            }
            if (self::precise($last) && self::precise($fix)) {
                // A curved route may have a short endpoint displacement despite
                // high speed. Keep sparse-capture eligibility independent of the
                // average-speed classifier; this matters for a moving iOS peer.
                if ($distance < max(20,$last['accuracy']+$fix['accuracy'])) $alignedUntil=0;
                elseif ($dt>=25 && $dt<=self::MAX_MOTION_OBSERVATION_SECONDS)
                    $alignedUntil=$fix['updated_at']+self::MAX_MOTION_OBSERVATION_SECONDS;
            }
        }
        $points[] = $fix;
        $points = array_values(array_filter($points, fn($point) => $fix['updated_at']-$point['updated_at'] <= 90));
        $this->tracks[$id] = ['points' => array_slice($points, -8),
            'moving' => $moving, 'aligned_until' => $alignedUntil, 'revision' => $fix['revision'] ?? 0];
    }

    public function forget(string $id): void { unset($this->tracks[$id]); }

    public function retain(array $activeIds): void {
        $this->tracks = array_intersect_key($this->tracks, $activeIds);
    }

    public function distance(string $a, string $b, array $first, array $second, float $now): ?float {
        $this->observe($a, $first);
        $this->observe($b, $second);
        $moving = ($this->tracks[$a]['moving'] ?? false) || ($this->tracks[$b]['moving'] ?? false);
        if (!$moving) return self::metres($first, $second);
        if ($now<=max($this->tracks[$a]['aligned_until'] ?? 0,$this->tracks[$b]['aligned_until'] ?? 0))
            return $this->commonCaptureDistance($a,$b,$first,$second,$now);
        // Fail closed on stale/missing data, including a network or power-mode gap.
        foreach ([$first, $second] as $fix) {
            $age = $now - $fix['updated_at'];
            if (!self::precise($fix) || $age < -5 || $age > self::MAX_MOVING_AGE_SECONDS) return null;
        }
        if (abs($first['updated_at']-$second['updated_at']) > self::MAX_SKEW_SECONDS) return null;
        $target = min($first['updated_at'], $second['updated_at']);
        $one = $this->at($a, $first, $target);
        $two = $this->at($b, $second, $target);
        return $one !== null && $two !== null ? self::metres($one, $two) : null;
    }

    private function commonCaptureDistance(string $a,string $b,array $first,array $second,float $now): ?float {
        foreach ([$first,$second] as $fix) {
            $age=$now-$fix['updated_at'];
            if (!self::precise($fix) || $age < -5 || $age>self::MAX_ALIGNED_AGE_SECONDS) return null;
        }
        // Even without a new common capture, fresh positions may already prove
        // separation. Do not hide that evidence by selecting an older nearby pair.
        $lowerBound=self::metres($first,$second)-55*abs($first['updated_at']-$second['updated_at']);
        if ($lowerBound>ProximityConfig::RADIUS_METRES) return $lowerBound;
        $one=$this->tracks[$a]['points'] ?? []; $two=$this->tracks[$b]['points'] ?? [];
        $time=-INF; $distance=null;
        foreach ($one as $p) foreach ($two as $q) {
            $at=min($p['updated_at'],$q['updated_at']); $skew=abs($p['updated_at']-$q['updated_at']);
            if ($at<=$time || $now-$at>self::MAX_ALIGNED_AGE_SECONDS || $now-$at < -5
                || $skew>self::MAX_CAPTURE_SKEW_SECONDS || !self::precise($p) || !self::precise($q)) continue;
            // Select by capture time, never by whichever pair happens to be closest.
            $time=$at; $distance=self::metres($p,$q)+55*$skew;
        }
        // Mixed iPhone/Android: only the existing short, observed segments can
        // be interpolated. Android's long gaps are never invented as straight lines.
        foreach (array_merge($one,$two) as $point) {
            $at=$point['updated_at'];
            if ($at<=$time || $now-$at>self::MAX_ALIGNED_AGE_SECONDS || $now-$at < -5
                || $at>min($first['updated_at'],$second['updated_at'])) continue;
            $p=$this->at($a,$first,$at); $q=$this->at($b,$second,$at);
            if ($p!==null && $q!==null) {$time=$at;$distance=self::metres($p,$q);}
        }
        return $distance;
    }

    private function at(string $id, array $latest, float $target): ?array {
        if ($latest['updated_at'] == $target) return $latest;
        $points = $this->tracks[$id]['points'] ?? [];
        foreach ($points as $point) if ($point['updated_at']==$target && self::precise($point)) return $point;
        for ($i = 1; $i < count($points); $i++) {
            $before = $points[$i-1]; $after = $points[$i];
            $dt = $after['updated_at'] - $before['updated_at'];
            if ($before['updated_at'] > $target || $after['updated_at'] < $target) continue;
            if ($dt <= 0 || $dt > self::MAX_SEGMENT_SECONDS || !self::precise($before)
                || !self::precise($after) || self::metres($before,$after)/$dt > 55) return null;
            $fraction = ($target-$before['updated_at'])/$dt;
            // Shortest longitude arc also works when crossing the date line.
            $longitudeDelta = fmod($after['longitude']-$before['longitude']+540,360)-180;
            return ['latitude' => $before['latitude']+($after['latitude']-$before['latitude'])*$fraction,
                'longitude' => fmod($before['longitude']+$longitudeDelta*$fraction+540,360)-180];
        }
        return null;
    }

    private static function precise(array $fix): bool {
        return isset($fix['accuracy']) && is_finite((float)$fix['accuracy'])
            && $fix['accuracy'] > 0 && $fix['accuracy'] <= 25;
    }

    public static function metres(array $a, array $b): float {
        $p = deg2rad($b['latitude']-$a['latitude']); $l = deg2rad($b['longitude']-$a['longitude']);
        $h = sin($p/2)**2 + cos(deg2rad($a['latitude']))*cos(deg2rad($b['latitude']))*sin($l/2)**2;
        return 12742000*asin(sqrt(max(0,min(1,$h))));
    }
}
