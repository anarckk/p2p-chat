session_id:cac68e06-95f9-4ba2-8724-3625f66cbd05

我看到你分析的部分成果了，localStorage有配额限制，数据太大就会出错。
我建议改造成INDEXDB。
整个系统 LocalStorage 和 IndexDB 并存，大数据量存 IndexDB，小数据量放 LocalStorage。