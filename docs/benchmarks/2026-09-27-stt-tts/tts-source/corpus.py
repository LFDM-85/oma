"""Frozen bilingual development/final inputs; no model outputs in this module."""
import csv
import hashlib
import json
from pathlib import Path

ROOT=Path(__file__).parent
CRITICAL={
 'ja':{1:[['omatext','オマテキスト','オーマテキスト'],['新規']],2:[['ミニ']],3:[['ノーマル']],4:[['過去'],['会話']],5:[['閉じ']],6:[['保存しない','保存せず']],7:[['閉じない']],8:[['バイバイ']],9:[['訳'],['続け']],10:[['一足す一','1足す1']],13:[['全角'],['スペース']],14:[['句点']],15:[['消さず'],['改行']],26:[['右'],['だけ'],['閉じ']],27:[['左'],['閉じない']],29:[['中止']],30:[['取り消']],32:[['青']],33:[['保存しない']],36:[['終了しない']],38:[['やめて'],['二足す二','2足す2']],43:[['変更せず']],48:[['変えない']]},
 'en':{1:[['omatext','oma text'],['blank']],2:[['mini']],3:[['normal']],4:[['conversation'],['history']],5:[['close']],6:[['without saving']],7:[['do not close',"don't close"]],8:[['goodbye']],9:[['translate'],['keep']],10:[['one plus one','1 plus 1']],13:[['one space','1 space']],14:[['period']],15:[['without deleting'],['new line','newline']],26:[['right'],['only'],['close']],27:[['left'],['do not close',"don't close"]],29:[['cancel']],30:[['withdraw']],32:[['blue']],33:[['without saving']],36:[['do not exit',"don't exit"]],38:[['stop'],['two plus two','2 plus 2']],43:[['without changing']],48:[['do not change',"don't change"]]}}


def cases(language,split):
    rows=list(csv.DictReader((ROOT/'utterances.tsv').open(),delimiter='\t'))
    selected=[r for r in rows if r['split'].strip()==split]
    return [{'id':f'{language}-{split}-{i:02}', 'language':language,'split':split,'text':r[language],
             'critical':CRITICAL[language].get(i,[]) if split=='final' else [],
             'condition':['clean','quiet','noise'][i%3]} for i,r in enumerate(selected,1)]


def corpus_hash():
    return hashlib.sha256(json.dumps([cases(l,s) for l in ('ja','en') for s in ('dev','final')],ensure_ascii=False,sort_keys=True).encode()).hexdigest()


def noise_cases(language):
    return [{'id':f'{language}-noise-{i:02}','language':language,'split':'final','text':'','critical':[],
             'condition':['silence','white','hum','clicks','pink'][i%5],'seed':i} for i in range(20)]
