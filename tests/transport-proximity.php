<?php
declare(strict_types=1);
// Deterministic simulation: production proximity code, synthetic GPS/network/clock.
// No phones, live database, notifications or production traffic.
require_once dirname(__DIR__).'/vendor/autoload.php';

use App\CMS\TemporalProximity;

final class TransportDiscoveryHarness {
    use App\CMS\Realtime\Discovery;
    private const LOCALIZACAO_MAXIMA_IDADE_SEGUNDOS = 600;
    public function observe(string $id, array $fix): void { $this->locationTimeline()->observe($id,$fix); }
    public function near(array $a, array $b, int $now, ?float &$distance = null): bool {
        return $this->confirmarProximidade('a','b',$a,$b,$now,$distance);
    }
}
$checks = 0;
function verifyTransport(bool $ok, string $label): void {
    global $checks;
    if (!$ok) throw new RuntimeException('FAIL: '.$label);
    $checks++;
}
function sample(float $x, float $y, float $t, float $accuracy = 10, int $revision = 1): array {
    return ['latitude' => 38+$y/111194.9266, 'longitude' => -25+$x/(111194.9266*cos(deg2rad(38))),
        'accuracy' => $accuracy, 'updated_at' => 1800000000+$t, 'revision' => $revision];
}
function route(string $shape, float $t, float $speed): array {
    if ($shape === 'stop') $t = $t < 90 ? $t : ($t < 120 ? 90 : $t-30);
    if ($shape === 'curve') return [200*sin($t*$speed/200),200*(1-cos($t*$speed/200))];
    if ($shape === 'turn') return $t < 90 ? [$t*$speed,0] : [90*$speed,($t-90)*$speed];
    return [$t*$speed,0];
}
$rows = [];
foreach ([30,60,100] as $kmh) foreach ([0,2,5,9] as $phase) foreach ([0,3,15] as $delay) {
    $h = new TransportDiscoveryHarness(); $latest = []; $received = []; $events = [];
    $visible = 0; $total = 0; $rawMisses = 0;
    for ($t = 0; $t <= 240; $t++) {
        foreach (['a'=>0,'b'=>$phase] as $id=>$offset) if ($t >= $offset && ($t-$offset)%10 === 0) {
            $jitter = (($t*7+($id==='b'?3:0))%17)-8;
            $events[$t+($id==='b'?$delay:0)][] = [$id,sample($t*$kmh/3.6+($id==='b'?10:0)+$jitter,0,$t)];
        }
        foreach ($events[$t] ?? [] as [$id,$fix]) $received[$id] = $fix;
        if ($t%5===0) foreach ($received as $id=>$fix) { $latest[$id]=$fix; $h->observe($id,$fix); }
        if ($t<50 || count($latest)!==2) continue;
        $total++; $distance=null;
        if ($h->near($latest['a'],$latest['b'],1800000000+$t,$distance)) $visible++;
        if (TemporalProximity::metres($latest['a'],$latest['b'])>150) $rawMisses++;
    }
    verifyTransport($visible===$total,"same bus {$kmh} km/h, phase {$phase}s, delay {$delay}s: {$visible}/{$total}");
    $rows[]=['kmh'=>$kmh,'phase_s'=>$phase,'network_delay_s'=>$delay,'visible'=>$visible,'checks'=>$total,'raw_misses'=>$rawMisses];
}
foreach (['curve','turn','stop'] as $shape) foreach ([30,60,100] as $kmh) {
    $h=new TransportDiscoveryHarness(); $latest=[]; $visible=0; $total=0;
    for ($t=0;$t<=240;$t++) {
        foreach (['a'=>0,'b'=>5] as $id=>$offset) if ($t >= $offset && ($t-$offset)%10===0) {
            [$x,$y]=route($shape,$t,$kmh/3.6);
            $latest[$id]=sample($x+($id==='b'?10:0),$y,$t);
            $h->observe($id,$latest[$id]);
        }
        if ($t<20) continue;
        $total++; if ($h->near($latest['a'],$latest['b'],1800000000+$t)) $visible++;
    }
    verifyTransport($total===$visible,"same bus {$shape} {$kmh}: {$visible}/{$total}");
}
// Two different vehicles on the same road: raw positions can overlap despite a 250 m separation.
$h=new TransportDiscoveryHarness(); $latest=[]; $falseRaw=0;
for ($t=0;$t<=120;$t++) {
    foreach (['a'=>0,'b'=>5] as $id=>$offset) if ($t >= $offset && ($t-$offset)%10===0) {
        $latest[$id]=sample($t*100/3.6+($id==='b'?250:0),0,$t); $h->observe($id,$latest[$id]);
    }
    if ($t>=20) {
        verifyTransport(!$h->near($latest['a'],$latest['b'],1800000000+$t),'separate vehicles remain outside');
        if(TemporalProximity::metres($latest['a'],$latest['b'])<=150) $falseRaw++;
    }
}
verifyTransport($falseRaw>0,'separate-vehicle control actually reproduces raw false positives');
// One passenger leaves at 100 s; the other continues. Re-entry is based on new positions.
$h=new TransportDiscoveryHarness(); $latest=[];
for ($t=0;$t<=220;$t++) {
    foreach (['a'=>0,'b'=>5] as $id=>$offset) if ($t >= $offset && ($t-$offset)%10===0) {
        $x=($id==='b' && $t>=100 && $t<180) ? 100*60/3.6 : $t*60/3.6;
        $latest[$id]=sample($x,0,$t); $h->observe($id,$latest[$id]);
    }
    if ($t>=130 && $t<180) verifyTransport(!$h->near($latest['a'],$latest['b'],1800000000+$t),'passenger exit expires');
    if ($t>=210) verifyTransport($h->near($latest['a'],$latest['b'],1800000000+$t),'re-entry recovers with fresh history');
}
foreach (['network loss','power suspension'] as $label) {
    $h=new TransportDiscoveryHarness(); $latest=[];
    for ($t=0;$t<=300;$t++) {
        foreach (['a'=>0,'b'=>5] as $id=>$offset) if ($t >= $offset && ($t-$offset)%10===0) {
            if ($id==='b' && $t>=100 && $t<220) continue;
            $latest[$id]=sample($t*60/3.6,0,$t); $h->observe($id,$latest[$id]);
        }
        if ($t>=135 && $t<220) verifyTransport(!$h->near($latest['a'],$latest['b'],1800000000+$t),$label.' does not invent presence');
        if ($t>=250) verifyTransport($h->near($latest['a'],$latest['b'],1800000000+$t),$label.' recovers from fresh fixes');
    }
}
$p=new TemporalProximity();
$p->observe('a',sample(0,0,0));$p->observe('a',sample(200,0,10));
$p->observe('b',sample(100,0,5));
verifyTransport($p->distance('a','b',sample(200,0,10),sample(100,0,5),1800000010)<0.1,'interpolate at common capture');
verifyTransport($p->distance('a','b',sample(200,0,10),sample(100,0,5),1800000040)===null,'moving history cannot extend stale presence');
verifyTransport($p->distance('a','b',sample(200,0,10),sample(100,0,5,60),1800000010)===null,'poor accuracy fails closed while moving');
$p->observe('a',sample(900,0,9));
verifyTransport($p->distance('a','b',sample(200,0,10),sample(100,0,5),1800000010)<0.1,'late capture cannot replace newer history');
$p->observe('a',sample(200,0,10,10,2));
verifyTransport($p->distance('a','b',sample(200,0,10,10,2),sample(100,0,5),1800000010)>90,'consent revision clears old interpolation');
$p->forget('a');$p->retain([]);
verifyTransport($p->distance('a','b',sample(200,0,10),sample(100,0,5),1800000010)>90,'removal clears history');
$p=new TemporalProximity();
foreach (['a','b'] as $id) {
    $p->observe($id,sample(0,0,0));$p->observe($id,sample(200,0,10));
    $p->observe($id,sample(200,0,70));
}
verifyTransport($p->distance('a','b',sample(200,0,70),sample(200,0,70),1800000250)===0.0,
    'a confirmed stop returns to the existing stationary freshness policy');
// Existing radius and bounded uncertainty grace remain unchanged for stationary people.
$h=new TransportDiscoveryHarness();$a=sample(0,0,0);$b=sample(149,0,0);
verifyTransport($h->near($a,$b,1800000000),'149 m within radius');
$b=sample(160,0,1);
verifyTransport($h->near($a,$b,1800000001),'existing uncertainty grace');
verifyTransport(!$h->near($a,$b,1800000032),'uncertainty grace is not renewed by reads');
// Sparse Android updates must not be mistaken for stationary people. Two
// different vehicles can otherwise appear close solely because their fixes differ in age.
$p=new TemporalProximity();
$p->observe('a',sample(2*100/3.6,0,2));
$p->observe('a',sample(32*100/3.6,0,32));
$p->observe('b',sample(-13*100/3.6+300,0,-13));
$p->observe('b',sample(17*100/3.6+300,0,17));
$a=sample(32*100/3.6,0,32);$b=sample(17*100/3.6+300,0,17);
verifyTransport(TemporalProximity::metres($a,$b)<150,'sparse control reproduces a false nearby vehicle');
verifyTransport($p->distance('a','b',$a,$b,1800000032)===null,
    '30 s motion is detected but not interpolated over an unobserved long interval');
$b=sample(32*100/3.6+10,0,32);$p->observe('b',$b);
verifyTransport($p->distance('a','b',$a,$b,1800000032)<11,
    'sparse updates with truly matching captures remain comparable');
$nativeChecks=0;
if ($traceFile=getenv('MARGOT_NATIVE_TRACE')) {
    $trace=json_decode(file_get_contents($traceFile),true,512,JSON_THROW_ON_ERROR);
    $h=new TransportDiscoveryHarness();$latest=[];$events=[];
    foreach ($trace as $point) $events[$point['t']+($point['id']==='android'?3:0)][]=$point;
    for($t=0;$t<=360;$t++) {
        foreach($events[$t]??[] as $point) {
            $fix=['latitude'=>$point['lat'],'longitude'=>$point['lon'],'accuracy'=>10,
                'updated_at'=>1800000000+$point['t'],'revision'=>1];
            $id=$point['id']==='android'?'b':'a';$latest[$id]=$fix;$h->observe($id,$fix);
        }
        if($t<30 || count($latest)!==2)continue;
        verifyTransport($h->near($latest['a'],$latest['b'],1800000000+$t),
            'actual Swift + Java upload trace stays visible through boarding, stop and restart at '.$t);
        $nativeChecks++;
    }
}
echo json_encode(['checks'=>$checks,'same_bus_straight_scenarios'=>$rows,
    'native_trace_checks'=>$nativeChecks,'raw_separate_vehicle_false_positives'=>$falseRaw,'simulated_only'=>true],JSON_PRETTY_PRINT)."\n";
