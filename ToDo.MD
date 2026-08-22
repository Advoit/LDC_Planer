-	Hast du fragen, stell diese zuerst bevor du mit dem Projekt startest
- 	erstelle hier ein tool: LDC Projekt Planer
-	das projekt soll über github pages released werden, passe alles ensprechend an und erstelle eine kleine release anleitung
- 	Ziel ist eine dynamische PWA zum planen und ausführen von Porjekten caching offline first, local first, 
	die app soll vollständig offline funktionieren und man soll projekte sichern und wiederherstellen können, keine daten auf dem server nur lokal,
	Der server dient nur als "gerüst".
- 	Regeln: DRY-Prinzip (Don't Repeat Yourself),SRP (Single Responsibility Principle),  Klassen/Module: max. 300 Zeilen, 
	Benennungsregeln: Wie extrahierte Methoden und neue Klassen sinnvoll benannt werden (sprechende Namen, die den Zweck klar machen), Datenmigration möglichst hohe abwärts kompatibilität zu alten app versionen 
	Ausnahmen: Ein Hinweis, dass Ausnahmen (z.B. bei Datenklassen oder DTOs) begründet werden dürfen.
- 	Design: minimalistisch, modern, Flat, Apple like, Akzentfarbe Blau, dynamisch anpassung an mobile, PC und tablet
- 	Aufbau: es soll eine tool leiste/Button geben: Neues Projekt, Projekt sichern, Projekt Laden/zusammenführen, Neue Aufgabe, Aufgabe editiern (aktivieren/ deaktivieren), Material export.
	-	Neues Projekt: Öffnet ein modal bei dem gewarnt wird das alles vorhande entfernt wird, 
		nach dem bestätigen kann man ein neues projekt anlegen indem man einen namen (text, pflicht), einen ort (text, pflicht) und eine
		Beschreibung (text, optional) angibt, das projekt bekommt 
		dann eine individuelle ID (Ramdom 8 zeichen) an hand man später projekte zusammenführen kann etc.
	-	Projekt sichern: Export des kompletten projektes inkl. Bilder und texte etc. als zip datei mit der endung .ldcproj (mit sauberer ordner strunktur aller infos und bildern)
	-	Projekt Laden/zusammenführen: man kann eine gesicherte Projekt datei Laden, dann wird gefragt ob man das aktuelle Projekt
		überschreiben will oder ob man die projekte zusammenführen will (voraussetzung ist die gleiche Projekt ID (Zeige eine klare Meldung: 
		„Die Projekt-IDs stimmen nicht überein. Eine Zusammenführung ist nicht möglich.“Biete dann nur die Option „Aktuelles Projekt überschreiben“ an 
		(oder abbrechen)), wenn ja werden die Aufgaben IDs abgeglichen, bilder und texte werden zusammengeführt, bei identischem inhalt bleibt das lokale), 
		Fragen Sie bei Konflikt pro Aufgabe per Modal „Lokal behalten“ vs. „Importiertes übernehmen“ mit dem text,
		Für Bilder: Prüfung auf Duplikate über Hash-Wert (SHA-256) der Bilddaten. 
		Gleicher Hash = gleiches Bild → überspringen. Unterschiedlicher Hash → anhängen
	-	Neue Aufgabe: Hier soll man neue aufgaben erstellen können, felder sind Erstellungsdatum (Automatisch generiert), 
		Aufgaben ID (Automatisch gegeriert, Ramdom 8 zeichen), Name(text, pflicht), Beschreibung (text, pflicht), 
		Aufgaben/Mängel Bilder (Upload von Fotos, bilder soll man antippen und vergrößeren können mobile optimisation, thumbnail picker (normalerweise bild 1) optional), 
		Benötigtes Material (Bezeichnung (text), menge(zahl), einheit (Stück, VPE, Meter, Eigen) liste mit intellisense funktion von vorherigen 
		artikeln falls vorhanden in anderen AufgabenDie Intellisense soll nicht nur den Namen, sondern das Tupel aus (Name + zuletzt verwendete Einheit) vorschlagen. Bei Auswahl wird automatisch das Feld „Einheit“ mit der vorgeschlagenen Einheit vorausgefüll , Optional), Geplanter arbeitsaufwand (Zeitfeld hh:mm, optional) 
	-	Aufgabe editiern: Alle aufgaben in der Liste erhalten einen kleinen Bleistift und tippt man eine Aufgabe an kann man die aufgabe bearbeiten wie bei "Neue aufgabe" oder Löschen
	-	Materialliste druck export: Hier kann man wählen Nach Aufgaben (Aufgaben Name und Beschreibung dann Material liste, 
		dann die Nächste aufgabe etc.), Gesamtes Projekt (Alle artikel werden zusammengezählt und es wird eine gesamtliste für das Projekt erstellt, Die Summierung muss nach (Name + Einheit) gruppieren).
		Der Export bezieht nur offene Aufgaben ein, abgeschlossene werden ingnoriert es sei den man setzt eine checkbox dafür
	Hauptansicht
	-	Aufgaben übersicht 
		- Suchfunktion und filter (offenen, hinweis, behoben) und sortieren nach name, status, zeitaufwand (standard: behoben ausgeblendet und sortierung nach namen)
		- Liste aller aufgaben und Beschreibung und status (Offen, Hinweis oder Behoben) und geplanter zeitaufwand und 
		wenn es der platz erlaubt auch ein thubnail wenn bild vorhanden (Client-seitig mit Canvas-API, immer das erste hochgeladene Bild der Aufgabe und skalieren Sie es auf z.B. 60x60 Pixel (Quadrat, mittig zugeschnitten). 
		Speichern Sie dieses Thumbnail direkt als separates kleines Bild im Aufgaben-Objekt Generiere das Thumbnail immer neu, wenn sich das gewählte Bild ändert, 
		um bei großen Listen die Performance zu wahren (nicht jedes Mal neu rendern).)
	- 	Tippt man eine aufgabe an hat man eine übersicht dazu und kann die Aufgabe bearbeiten (achtung das hat nichts mit der aufgaben erstellung zu tun, die felder von der erstellung sollen hier nicht editierbar sein): 
		Status (Offen, Hinweis, Behoben) Bearbeitet von (Text, Pflicht), Bearbeitet am (Datum, Pflicht), Nachher Bilder( Upload von Fotos, bilder soll man antippen und vergrößeren 
		können mobile optimisation, optional), Hinweistext (Text, optional)
			Offen → Hinweis (erfordert zwingend das Ausfüllen von „Bearbeitet von“ und „Bearbeitet am“ erfordert zwingend zusätzlich das Ausfüllen des „Hinweistextes“, optional Nachher-Bilder)
			Hinweis → Behoben (erfordert zwingend das Ausfüllen von „Bearbeitet von“ und „Bearbeitet am“)
			Direkt von Offen auf Behoben ist ebenfalls erlaubt (erfordert zwingend das Ausfüllen von „Bearbeitet von“ und „Bearbeitet am“)
			
	
		
	 







