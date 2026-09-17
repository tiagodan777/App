"""Contratos de configuração, sem compilar nem executar a app nativa."""
import json
import plistlib
import re
import xml.etree.ElementTree as ET
from pathlib import Path
root=Path(__file__).resolve().parents[1]
checks=0
def check(condition,label):
    global checks
    assert condition,label
    checks+=1
config=json.loads((root/'capacitor.config.json').read_text())
app_id=config['appId']
check(app_id=='com.margot.app','Identificador Capacitor')
check(config['server']['url'].startswith('https://'),'WebView usa HTTPS')
check(config['server']['cleartext'] is False,'WebView não usa HTTP simples')
manifest=ET.parse(root/'android/app/src/main/AndroidManifest.xml').getroot()
android='{http://schemas.android.com/apk/res/android}'
permissions={el.get(android+'name') for el in manifest.findall('uses-permission')}
for name in ['INTERNET','ACCESS_COARSE_LOCATION','ACCESS_FINE_LOCATION','FOREGROUND_SERVICE','FOREGROUND_SERVICE_LOCATION','POST_NOTIFICATIONS']:
    check('android.permission.'+name in permissions,'Permissão Android '+name)
service=manifest.find('./application/service')
check(service.get(android+'foregroundServiceType')=='location','Tipo de serviço Android')
check(service.get(android+'exported')=='false','Serviço privado')
firebase=json.loads((root/'android/app/google-services.json').read_text())
check(any(c.get('client_info',{}).get('android_client_info',{}).get('package_name')==app_id for c in firebase['client']),'Firebase corresponde à app')
activity=(root/'android/app/src/main/java/com/margot/app/MainActivity.java').read_text()
check('registerPlugin(BackgroundLocationPlugin.class)' in activity,'Plugin Android registado')
provider=(root/'src/classes/CMS/PushProvider.php').read_text()
for channel in ['margot_activity','margot_hey','margot_message','margot_nearby']:
    check(channel in activity and channel in provider,'Canal push '+channel)
check((root/'android/app/src/main/res/drawable/ic_stat_margot.xml').is_file(),'Ícone FCM existe')
with (root/'ios/App/App/Info.plist').open('rb') as file: info=plistlib.load(file)
check('location' in info['UIBackgroundModes'],'Modo background iOS declarado')
for key in ['NSLocationWhenInUseUsageDescription','NSLocationAlwaysAndWhenInUseUsageDescription','NSCameraUsageDescription','NSPhotoLibraryUsageDescription']:
    check(bool(info.get(key)),'Descrição iOS '+key)
with (root/'ios/App/App/App.entitlements').open('rb') as file: entitlements=plistlib.load(file)
check(entitlements.get('aps-environment') in ['development','production'],'Entitlement APNs existe (assinatura final por validar)')
delegate=(root/'ios/App/App/AppDelegate.swift').read_text()
for callback in ['capacitorDidRegisterForRemoteNotifications','capacitorDidFailToRegisterForRemoteNotifications']:
    check(callback in delegate,'Callback APNs '+callback)
check('BackgroundLocationPlugin' in (root/'ios/App/App/ViewController.swift').read_text(),'Plugin iOS registado')
for platform,path in [('ios','ios/App/App/BackgroundLocationPlugin.swift'),('android','android/app/src/main/java/com/margot/app/BackgroundLocationService.java')]:
    source=(root/path).read_text()
    check(config['server']['url']+'/background-location-update/' in source,platform+' endpoint corresponde ao servidor')
check('LocationRelaunchCoordinator.swift' in (root/'ios/App/App.xcodeproj/project.pbxproj').read_text(),'Coordenador incluído no projeto Xcode')
print(f'OK: {checks} contratos de configuração nativa. Não é um build nem teste em dispositivo.')
