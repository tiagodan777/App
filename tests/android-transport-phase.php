<?php
declare(strict_types=1);
// Input must be produced by fixtures/AndroidTransportTrace.java, compiled with
// the production Java policies. This is simulation, not a two-phone field test.
require_once (getenv('MARGOT_TEST_ROOT') ?: dirname(__DIR__)).'/vendor/autoload.php';
use App\CMS\TemporalProximity;
final class PhaseDiscoveryHarness {
    use App\CMS\Realtime\Discovery;
    private const LOCALIZACAO_MAXIMA_IDADE_SEGUNDOS=600;
    public function record(string $id,array $f):void {$this->locationTimeline()->observe($id,$f);}
    public function near(array $a,array $b,int $t):bool {return $this->confirmarProximidade('a','b',$a,$b,$t);}
    public function forget(string $id):void {$this->clearProximityHistory($id);}
}
function phaseSample(float $x,float $t,int $revision=1):array {
    return ['latitude'=>38+$x/111194.9266,'longitude'=>-25,'accuracy'=>10,'updated_at'=>1800000000+$t,'revision'=>$revision];
}
$checks=0;$failures=[];
function phaseCheck(bool $ok,string $label):void {global $checks,$failures;$checks++;if(!$ok)$failures[]=$label;}
function phaseRanges(array $times):array {
    $ranges=[];foreach($times as $t){$i=count($ranges)-1;if($i>=0&&$ranges[$i][1]===$t-1)$ranges[$i][1]=$t;else$ranges[]=[$t,$t];}return $ranges;
}
$input=getenv('MARGOT_PHASE_TRACE');
if(!$input)throw new RuntimeException('Generate AndroidTransportTrace.java output and set MARGOT_PHASE_TRACE.');
$scenarios=json_decode(file_get_contents($input),true,512,JSON_THROW_ON_ERROR);$results=[];
if($iosInput=getenv('MARGOT_PHASE_IOS_TRACE')) {
    $ios=json_decode(file_get_contents($iosInput),true,512,JSON_THROW_ON_ERROR);
    $mixed=[];foreach($scenarios as $s)foreach($ios as $peer)if($peer['shape']===$s['shape']&&$peer['kmh']===$s['kmh']) {
        $s['pair']='android_ios';$s['optimized_b']=['trace'=>$peer['trace']];$mixed[]=$s;break;
    }
    $scenarios=array_merge($scenarios,$mixed);
}
foreach($scenarios as $s) {
    if(!isset($s['pair']))foreach(['a','b'] as $id) {
        $opt=$s['optimized_'.$id];$base=$s['baseline_'.$id];
        phaseCheck($opt['captures']<=$base['captures'],'capture budget '.json_encode(array_slice($s,0,4)).' '.$id);
        phaseCheck($opt['attempts']<=$base['attempts'],'upload budget '.json_encode(array_slice($s,0,4)).' '.$id);
    }
    foreach([0,3,15] as $delay) {
        $h=new PhaseDiscoveryHarness();$events=[];$latest=[];$received=[];$gaps=[];$visible=0;$first=null;$asserted=0;$errors=[];
        foreach(['a','b'] as $id)foreach($s['optimized_'.$id]['trace'] as $f) {
            $arrival=(int)ceil($f['sent']+($id==='b'?$delay:0));
            $events[$arrival][]=[$id,['latitude'=>$f['lat'],'longitude'=>$f['lon'],'accuracy'=>10,'updated_at'=>1800000000+$f['t'],'revision'=>1]];
        }
        $duration=$s['shape']==='straight'?3600:600;
        for($t=0;$t<$duration;$t++) {
            foreach($events[$t]??[] as [$id,$f])$received[$id]=$f;
            // Production persistence is polled, so do not let the test use uploads early.
            if($t%5===0)foreach($received as $id=>$f){$latest[$id]=$f;$h->record($id,$f);}
            $near=count($latest)===2&&$h->near($latest['a'],$latest['b'],1800000000+$t);
            if($near){$visible++;$first??=$t;}else$gaps[]=$t;
            $expected=null;
            if($t>=140) {
                if(in_array($s['shape'],['straight','curve','turn']))$expected=true;
                // After a stationary heartbeat there is no fresh common moving
                // evidence until both phones deliver again. Measure these gaps
                // above and require bounded recovery; do not pretend they vanish.
                elseif($s['shape']==='journey'&&($t<180||($t>=260&&$t<300)||$t>=400))$expected=true;
                elseif($s['shape']==='separate')$expected=false;
                elseif($s['shape']==='journey')$expected=null;
                elseif($t<180||$t>=410)$expected=true;
                // Includes the existing 30 s uncertainty grace at 150–175 m.
                elseif($t>=260&&$t<300)$expected=false;
            }
            if($expected!==null){$asserted++;if($near!==$expected)$errors[]=$t;}
        }
        $row=['pair'=>$s['pair']??'android_android','shape'=>$s['shape'],'kmh'=>$s['kmh'],'phase'=>$s['phase'],'timing'=>$s['timing'],'delay'=>$delay,
            'visible_seconds'=>$visible,'duration'=>$duration,'first_visible'=>$first,'missing_ranges'=>phaseRanges($gaps),
            'asserted_seconds'=>$asserted,'failed_ranges'=>phaseRanges($errors)];
        phaseCheck(!$errors,'visibility '.json_encode($row));$results[]=$row;
    }
}
// Bound freshness, pick the newest common observation, preserve revocation and
// never project an unobserved long Android segment through a curved journey.
$p=new TemporalProximity();
foreach(['a','b'] as $id)foreach([0,40,80] as $t)$p->observe($id,phaseSample($t*20,$t));
$a=phaseSample(1600,80);$b=phaseSample(1600,80);
phaseCheck($p->distance('a','b',$a,$b,1800000145)===0.0,'common actual observation usable to bounded deadline');
phaseCheck($p->distance('a','b',$a,$b,1800000146)===null,'expired common observation cannot be kept alive by reads');
$b=phaseSample(1900,80.1);$p->observe('b',$b);
phaseCheck($p->distance('a','b',$a,$b,1800000081)>150,'new separation overrides older nearby observation');
$p->forget('a');$a=phaseSample(1600,80,2);
phaseCheck($p->distance('a','b',$a,$b,1800000081)>150,'removed owner cannot recover old common nearby history');
$p->retain([]);
$p->observe('a',phaseSample(0,0));$p->observe('a',phaseSample(800,40));
$p->observe('b',phaseSample(400,20));$p->observe('b',phaseSample(1200,60));
phaseCheck($p->distance('a','b',phaseSample(800,40),phaseSample(1200,60),1800000060)===null,'no extrapolation or long-gap interpolation');
$summary=['simulation_only'=>true,'checks'=>$checks,'scenarios'=>count($results),'passed'=>!$failures,'failures'=>$failures,'results'=>$results];
if($out=getenv('MARGOT_PHASE_RESULTS'))file_put_contents($out,json_encode($summary,JSON_PRETTY_PRINT));
echo json_encode(['simulation_only'=>true,'checks'=>$checks,'scenarios'=>count($results),'passed'=>!$failures,'failures'=>array_slice($failures,0,20)],JSON_PRETTY_PRINT)."\n";
exit($failures?1:0);
