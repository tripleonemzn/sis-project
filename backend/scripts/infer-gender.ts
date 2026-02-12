import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const MALE_KEYWORDS = [
  'muhammad', 'mohammad', 'moh.', 'ahmad', 'rizky', 'putra', 'fajar', 'bayu', 
  'dimas', 'adi', 'budi', 'eko', 'dwi', 'tri', 'agus', 'bambang', 'hendra', 
  'joko', 'kurniawan', 'saputra', 'setiawan', 'wijaya', 'yusuf', 'ibrahim', 
  'ismail', 'hidayat', 'pratama', 'aditya', 'yoga', 'reza', 'kevin', 'm.', 
  'abdul', 'abdullah', 'adam', 'aji', 'akbar', 'aldi', 'alif', 'alvin', 
  'amir', 'andre', 'andry', 'angga', 'anugrah', 'ari', 'arif', 'arief', 
  'aris', 'arya', 'bagas', 'bagus', 'bintang', 'bobby', 'candra', 'chandra', 
  'dadang', 'dani', 'danny', 'dedi', 'deni', 'denny', 'dicky', 'diki', 
  'dodi', 'doni', 'edi', 'edy', 'fadhil', 'fadil', 'fahmi', 'fais', 'faisal', 
  'faiz', 'farhan', 'farid', 'faris', 'fauzan', 'febri', 'feri', 'ferry', 
  'firman', 'galih', 'gede', 'gilang', 'gunawan', 'guntur', 'gusti', 'hadi', 
  'hafiz', 'haikal', 'hamdan', 'hamzah', 'hariyanto', 'hartono', 'hary', 
  'haryanto', 'hasan', 'hendrik', 'heri', 'herman', 'heru', 'ikhsan', 'ilham', 
  'imam', 'iman', 'indra', 'irawan', 'irfan', 'irwan', 'ivan', 'iwan', 
  'jaya', 'jodi', 'johan', 'junaedi', 'krisna', 'luthfi', 'mahendra', 
  'malik', 'marcel', 'martin', 'maulana', 'miftah', 'moch', 'muchamad', 
  'muhamad', 'mukti', 'mulya', 'nando', 'nasir', 'naufal', 'nico', 'niko', 
  'noval', 'nugraha', 'okta', 'panji', 'prasetyo', 'purnomo', 'rahmat', 
  'raihan', 'rama', 'ramadhan', 'randi', 'randy', 'rangga', 'rayhan', 
  'rendy', 'rezy', 'rhaka', 'rian', 'riano', 'ricky', 'rico', 'ridwan', 
  'rifki', 'riki', 'riko', 'rio', 'riski', 'riza', 'rizal', 'robby', 
  'robi', 'romi', 'roni', 'rudi', 'ryan', 'ryant', 'salman', 'sandi', 
  'sandy', 'satria', 'septian', 'setiadi', 'sidik', 'sigit', 'slamet', 
  'soleh', 'sugeng', 'suharto', 'suherman', 'sulaiman', 'supri', 'supriyadi', 
  'surya', 'sutrisno', 'syahputra', 'syahrul', 'taufik', 'taufiq', 'teguh', 
  'tio', 'tono', 'wahyu', 'wawan', 'wibowo', 'wira', 'wisnu', 'yadi', 
  'yanuar', 'yuda', 'yudha', 'yudi', 'yudo', 'yulian', 'zainal', 'zaki', 
  'zulfikar', 'al', 'alex', 'alfian', 'ali', 'alfin', 'amar', 'amin', 'anam',
  'andika', 'anggi', 'anton', 'anwar', 'arifin', 'arjuna', 'arkan', 'arnold',
  'arsya', 'arvin', 'asep', 'asrul', 'aulian', 'awwab', 'azhar', 'azka',
  'azmi', 'bagio', 'bahar', 'baihaqi', 'baim', 'bakti', 'bastian', 'benny',
  'bima', 'bimo', 'bisma', 'boni', 'bram', 'brian', 'burhan', 'chairul',
  'chairil', 'ciko', 'ciputra', 'dafa', 'daffa', 'danang', 'danu', 'dariso',
  'darma', 'darmawan', 'daru', 'david', 'davie', 'davin', 'dedy', 'defri',
  'deka', 'delon', 'deri', 'derry', 'deska', 'desta', 'dewa', 'dhani',
  'dian', 'didik', 'didin', 'dika', 'dikta', 'dino', 'dion', 'dirga',
  'djoko', 'dwi', 'dzaki', 'dzaky', 'edo', 'edward', 'efendi', 'egi',
  'eka', 'elvan', 'emil', 'endang', 'erik', 'erlangga', 'erwin', 'esa',
  'evan', 'fabi', 'fahri', 'fandy', 'faqih', 'farid', 'fathur', 'fatih',
  'febrian', 'felix', 'fendi', 'ferdi', 'ferdy', 'fian', 'fikri', 'firdaus',
  'frans', 'fredy', 'ganang', 'ganda', 'gani', 'garin', 'gatot', 'gavin',
  'ghani', 'ghofar', 'ghofur', 'gilbert', 'giri', 'gito', 'guntur', 'gus',
  'gusti', 'habib', 'hadi', 'hafiz', 'haikal', 'hakim', 'halim', 'hanafi',
  'handoko', 'hanif', 'hari', 'haris', 'harris', 'haryadi', 'hasbi', 'hendra',
  'henry', 'herlambang', 'hermawan', 'hidayat', 'hilman', 'hisyam', 'huda',
  'husen', 'husni', 'ibnu', 'ignatius', 'ihsan', 'ikbal', 'ilham', 'ilyas',
  'imam', 'imran', 'indra', 'indro', 'iqbal', 'irfan', 'irham', 'irshad',
  'irsyad', 'irvan', 'ismail', 'iswanto', 'jamal', 'januar', 'jarwo', 'jason',
  'jefri', 'jerry', 'jihan', 'jimmy', 'johan', 'joko', 'jonathan', 'joni',
  'jovan', 'juan', 'juli', 'jumadi', 'junaidi', 'justin', 'kaka', 'kamil',
  'kardi', 'karim', 'karyo', 'kasim', 'kelvin', 'ken', 'kendy', 'kenji',
  'khaerul', 'khalid', 'kholid', 'kholil', 'kiki', 'koko', 'komang', 'kosim',
  'kresna', 'kris', 'kristian', 'kukuh', 'kurniawan', 'kusnadi', 'kusumo',
  'lalu', 'lasmono', 'latif', 'leo', 'leon', 'leonardo', 'lian', 'lintang',
  'lucky', 'lukman', 'lutfi', 'made', 'mahesa', 'mahmud', 'maman', 'mamat',
  'mario', 'markus', 'marno', 'martin', 'maskur', 'miko', 'milda', 'mirza',
  'misbah', 'mochamad', 'mohamad', 'muh', 'muhammad', 'muhsin', 'mukhlis',
  'mulyadi', 'munir', 'musa', 'mustafa', 'mustofa', 'muzakki', 'nabil',
  'nanda', 'nardi', 'narendra', 'nasrul', 'nathan', 'nawawi', 'nazar',
  'nelson', 'nendi', 'neri', 'nino', 'nizam', 'nofri', 'nopri', 'nova',
  'novan', 'novri', 'nugroho', 'nur', 'nurhadi', 'nursalim', 'nyoman',
  'okta', 'oktavian', 'omar', 'ongki', 'oscar', 'pande', 'pandu', 'panji',
  'pardi', 'parman', 'parto', 'pasha', 'paulus', 'pepen', 'permana', 'petrus',
  'prabowo', 'pradana', 'prama', 'pramono', 'pramudya', 'pras', 'prasetya',
  'prayoga', 'pri', 'prima', 'puji', 'purwanto', 'putra', 'putu', 'rachman',
  'raden', 'radit', 'raditya', 'rafa', 'raffi', 'rafli', 'rahmat', 'rai',
  'raihan', 'raja', 'raka', 'rama', 'ramdhan', 'ramzi', 'rangga', 'rasya',
  'ray', 'rayhan', 'razak', 'rehan', 'reinaldi', 'reindra', 'rendi', 'reno',
  'reny', 'resa', 'reski', 'restu', 'revan', 'rey', 'reyhan', 'reza',
  'rezky', 'rheza', 'rhoma', 'rian', 'ricardo', 'richard', 'ricky', 'ridho',
  'ridwan', 'rifai', 'rifan', 'rifky', 'rifqi', 'rio', 'risan', 'riski',
  'risky', 'riswanto', 'rivo', 'rizal', 'rizki', 'rizky', 'robert', 'robin',
  'roby', 'rochim', 'rochman', 'rodli', 'rohman', 'roi', 'rokhim', 'romi',
  'romy', 'ronny', 'rony', 'rosid', 'roy', 'royan', 'ruben', 'rudi', 'rudy',
  'rusdi', 'ruslan', 'rusli', 'rustam', 'ryan', 'sabda', 'sadewa', 'saiful',
  'sakti', 'salim', 'sam', 'samsul', 'sandi', 'sandy', 'sanusi', 'sapto',
  'saputra', 'satria', 'satrio', 'saul', 'sepri', 'septian', 'seta', 'seto',
  'shandi', 'shandy', 'sholeh', 'shoni', 'sigit', 'simon', 'sinaga', 'sindu',
  'slamet', 'sobari', 'sofian', 'sofyan', 'soleh', 'solihin', 'soni', 'sonny',
  'sony', 'steven', 'subagyo', 'subhan', 'sudirman', 'sufyan', 'sugeng',
  'sugi', 'sugianto', 'sugih', 'suhadi', 'suhendra', 'sukma', 'sultan',
  'sumantri', 'sunardi', 'sunaryo', 'sandi', 'surya', 'suryadi', 'susanto',
  'susilo', 'sutrisno', 'syahrul', 'syaiful', 'syamsul', 'syarif', 'syauqi',
  'tadeo', 'tama', 'tan', 'tara', 'tatang', 'taufik', 'tegar', 'teguh',
  'teddy', 'theo', 'thomas', 'tian', 'timotius', 'tito', 'tommy', 'tomy',
  'toni', 'tony', 'topan', 'totok', 'tri', 'trisno', 'try', 'tulus',
  'ugik', 'ulil', 'umar', 'usman', 'valen', 'valentino', 'valian', 'verdi',
  'very', 'vian', 'victor', 'vicky', 'vincent', 'vito', 'wahid', 'wahyu',
  'wahyudi', 'waluyo', 'wawan', 'wayan', 'wendy', 'wibowo', 'widodo', 'wigi',
  'wiguna', 'wildan', 'willy', 'wilson', 'wim', 'wira', 'wisnu', 'wiwid',
  'yance', 'yandri', 'yani', 'yanuar', 'yasin', 'yasir', 'yayan', 'yayat',
  'yazid', 'yoga', 'yogi', 'yohan', 'yohanes', 'yok', 'yoko', 'yona',
  'yonda', 'yopi', 'yosep', 'yoseph', 'yosua', 'yuda', 'yudi', 'yudistira',
  'yudha', 'yulius', 'yunus', 'yus', 'yusuf', 'yusup', 'zaen', 'zaenal',
  'zaid', 'zain', 'zainal', 'zainudin', 'zakaria', 'zaki', 'zamzam', 'zian',
  'zidane', 'zulfan', 'zulfikar', 'zulham', 'zulki'
];

const FEMALE_KEYWORDS = [
  'putri', 'ayu', 'siti', 'nur', 'dewi', 'sari', 'wulan', 'indah', 'lestari', 
  'rahma', 'aulia', 'nabila', 'zahra', 'annisa', 'fauziah', 'fitri', 'ratna', 
  'melati', 'mawar', 'intan', 'mutiara', 'dinda', 'tiara', 'citra', 'dian', 
  'rini', 'widya', 'sri', 'ani', 'yuli', 'yanti', 'rina', 'rita', 'ika', 
  'lina', 'lisa', 'maya', 'mega', 'nina', 'novi', 'nurul', 'reni', 'rika', 
  'riska', 'rizka', 'santi', 'siska', 'suci', 'syifa', 'tari', 'tika', 
  'tina', 'tini', 'ulfa', 'vina', 'wati', 'winda', 'yani', 'yulia', 'yunita',
  'aisyah', 'alya', 'amanda', 'amelia', 'andini', 'angel', 'anggun', 'anita',
  'aprilia', 'arinda', 'astrid', 'aurelia', 'bela', 'bella', 'berlian',
  'cahaya', 'cantika', 'cici', 'cindy', 'clara', 'clarissa', 'desy', 'devi',
  'diah', 'diana', 'dina', 'dini', 'elisa', 'elma', 'elsa', 'elsi', 'ely',
  'eni', 'erika', 'erina', 'erni', 'eva', 'fanny', 'fany', 'fara', 'farah',
  'fatimah', 'feni', 'fina', 'gita', 'hana', 'hani', 'hanifah', 'hanna',
  'helen', 'heni', 'hesti', 'ida', 'iis', 'ike', 'imel', 'imelda', 'irma',
  'isabel', 'isnaini', 'ita', 'jelita', 'jessica', 'julia', 'juwita',
  'kartika', 'kiki', 'khusnul', 'khairun', 'kristin', 'lania', 'laila',
  'laras', 'leli', 'lena', 'leni', 'lia', 'lidya', 'lilis', 'linda', 'lola',
  'lusi', 'lusiana', 'maharani', 'marina', 'marisa', 'marsya', 'martha',
  'meilani', 'melani', 'meli', 'melisa', 'meri', 'mia', 'mida', 'mila',
  'mimi', 'mira', 'mona', 'monica', 'murni', 'nadia', 'nadin', 'nadya',
  'naila', 'nana', 'nani', 'nita', 'novia', 'novita', 'nunik', 'nurhaliza',
  'oktavia', 'olive', 'olivia', 'pipit', 'pratiwi', 'puput', 'putu', 'rani',
  'ratu', 'regina', 'rena', 'resti', 'rida', 'rika', 'rinda', 'ririn',
  'risma', 'rossa', 'rosidah', 'rosita', 'safira', 'salsa', 'salsabila',
  'sandra', 'sania', 'sari', 'sartika', 'sekar', 'sela', 'seli', 'selvi',
  'septi', 'serli', 'sesil', 'shania', 'sheila', 'sherly', 'sifa', 'silvi',
  'silvia', 'sindy', 'sinta', 'sisca', 'sofia', 'sonia', 'susanti', 'susi',
  'syifa', 'talia', 'tania', 'tasya', 'tatia', 'tita', 'triana', 'utami',
  'vani', 'vania', 'vera', 'veronika', 'via', 'vivi', 'widia', 'wina',
  'windi', 'wulandari', 'yeni', 'yesi', 'yola', 'yolanda', 'yosi', 'yuni',
  'yusnita', 'zaskia', 'adel', 'adela', 'adelia', 'adeline', 'adis', 'adisty',
  'aditya', 'afifah', 'afni', 'agnes', 'agustin', 'agustina', 'aida', 'ainun',
  'aisah', 'ajeng', 'alfin', 'alifia', 'alisa', 'aliya', 'alma', 'alvira',
  'alya', 'amalia', 'ami', 'aminah', 'amira', 'ana', 'ananda', 'anastasia',
  'andrea', 'angela', 'angelia', 'angelina', 'anggi', 'anggraini', 'ani',
  'anis', 'anisa', 'anjar', 'anti', 'antonia', 'apri', 'april', 'ardiana',
  'ari', 'ariani', 'arin', 'arini', 'ariska', 'arlinda', 'arum', 'aryani',
  'asri', 'astuti', 'asya', 'athifah', 'ati', 'atik', 'atika', 'atun',
  'audrey', 'aulia', 'aurel', 'ayunda', 'ayuningtyas', 'azizah', 'bernadetta',
  'bernadette', 'beta', 'beti', 'betty', 'bunga', 'cahya', 'candra', 'carissa',
  'caroline', 'catherine', 'cecilia', 'celine', 'chelsea', 'chika', 'chintya',
  'christina', 'christine', 'cindy', 'cinta', 'citra', 'claudia', 'corry',
  'cucu', 'cut', 'damayanti', 'dara', 'darla', 'daryati', 'dea', 'deby',
  'dede', 'della', 'delia', 'dela', 'dhea', 'dhita', 'diah', 'dian',
  'diana', 'diani', 'dila', 'dinda', 'dini', 'dita', 'diva', 'diyah',
  'dwi', 'ebie', 'echa', 'efrita', 'eka', 'elawati', 'elda', 'eli',
  'elin', 'elis', 'elizabeth', 'ella', 'ellen', 'elly', 'elsye', 'elya',
  'ema', 'emilia', 'enda', 'endah', 'endang', 'eni', 'enjel', 'enny',
  'erlin', 'erlina', 'erna', 'ernawati', 'ester', 'esti', 'etika', 'ety',
  'eva', 'evi', 'fadhilah', 'fadia', 'fairuz', 'faiza', 'fany', 'farida',
  'fatma', 'fatmawati', 'fauzia', 'fauziah', 'febby', 'febi', 'febri', 'febriani',
  'fela', 'felia', 'felicia', 'fenny', 'ferawati', 'fiitri', 'fika', 'fikha',
  'fina', 'fira', 'firda', 'fitri', 'fitriani', 'fitriyani', 'flora', 'fransiska',
  'frederika', 'frida', 'friska', 'gabriella', 'galuh', 'gita', 'gladis', 'gladys',
  'grace', 'gracia', 'gretchen', 'gusnita', 'gusti', 'halimah', 'hana', 'handayani',
  'hani', 'hanum', 'hany', 'happy', 'hartati', 'hartini', 'hasanah', 'hasna',
  'hastuti', 'hayatun', 'helena', 'helmi', 'helsi', 'henny', 'hera', 'herlin',
  'herlina', 'hermin', 'hesty', 'hidayati', 'hijrah', 'hikmah', 'hilda', 'husna',
  'ida', 'idha', 'ifana', 'iffa', 'ika', 'ike', 'iklima', 'ilma',
  'imaculata', 'imas', 'imelda', 'imroatus', 'ina', 'inayah', 'indah', 'indira',
  'indri', 'indriani', 'ine', 'ines', 'inggit', 'ingrid', 'intan', 'ira',
  'irawati', 'irene', 'irma', 'irmayanti', 'isabela', 'ismi', 'isni', 'isra',
  'isti', 'istikhomah', 'ita', 'ivana', 'ivone', 'izah', 'jamila', 'jamilah',
  'janet', 'janti', 'jasmin', 'jasmine', 'jeanny', 'jeany', 'jihan', 'juli',
  'julia', 'juliana', 'julianti', 'julie', 'jumiatun', 'junita', 'juwita', 'kadek',
  'kamelia', 'kamila', 'kanti', 'karin', 'karina', 'karla', 'karmila', 'kartika',
  'kartini', 'kasih', 'katerina', 'katharina', 'keiko', 'keisha', 'keke', 'kenanga',
  'kesya', 'kezia', 'khadijah', 'khairun', 'khansa', 'kharisma', 'kholifah', 'khusnul',
  'kiara', 'kiki', 'kinan', 'kinanti', 'kirana', 'komalasari', 'komang', 'komariah',
  'krisdayanti', 'kristin', 'kristina', 'kumala', 'kurnia', 'kurniawati', 'kusuma', 'kusumawati',
  'laela', 'laili', 'laksmi', 'lala', 'lana', 'lani', 'laras', 'larasati',
  'lastri', 'latifah', 'laura', 'lela', 'lena', 'leny', 'leoni', 'lestari',
  'leti', 'lia', 'lidia', 'lili', 'lilis', 'lily', 'lina', 'linda',
  'lindi', 'lis', 'lisa', 'lisbet', 'lisna', 'lisnawati', 'livia', 'liza',
  'lola', 'loli', 'lolita', 'lona', 'lora', 'lufi', 'luh', 'lulu',
  'luluk', 'luna', 'lusy', 'lutfiah', 'luthfiyah', 'lydia', 'madona', 'magda',
  'magdalena', 'maharani', 'mahdalena', 'mahdalina', 'mai', 'maia', 'maisaroh', 'maita',
  'mala', 'malika', 'manda', 'marcella', 'mardiana', 'mareta', 'margareta', 'margareth',
  'margaretha', 'maria', 'mariana', 'mariani', 'marini', 'marisa', 'marlina', 'marni',
  'marsela', 'marta', 'martina', 'marwah', 'maryam', 'maryani', 'maryati', 'masitoh',
  'maulida', 'maulidina', 'mawar', 'maya', 'mayang', 'mayasari', 'mega', 'megawati',
  'mei', 'meilan', 'meilani', 'melati', 'melda', 'meli', 'melia', 'melinda',
  'melissa', 'memey', 'mery', 'meta', 'mey', 'meylani', 'mia', 'mida',
  'miftahul', 'mika', 'mila', 'milka', 'mimi', 'mina', 'minda', 'mini',
  'mintarsih', 'mira', 'mirna', 'mirnawati', 'misna', 'mitra', 'mona', 'monik',
  'monika', 'mufidah', 'muharti', 'mulia', 'mulyani', 'mumun', 'munawaroh', 'murni',
  'murniati', 'mutia', 'mutiara', 'mutmainah', 'nabila', 'nada', 'nadiya', 'nadra',
  'nafa', 'nafisa', 'naila', 'najwa', 'nana', 'nanda', 'nani', 'nanik',
  'naomi', 'narti', 'nasya', 'natalia', 'natasya', 'nawang', 'nela', 'neli',
  'nella', 'nelly', 'neng', 'nengsih', 'neni', 'nenng', 'neny', 'neti',
  'netty', 'ni', 'nia', 'niar', 'niken', 'nikita', 'nila', 'nilam',
  'nina', 'nindi', 'nindy', 'ning', 'ningrum', 'ningsih', 'nisa', 'nisrina',
  'nita', 'noer', 'nola', 'nopita', 'nora', 'novi', 'noviana', 'novianti',
  'novita', 'nuke', 'nunung', 'nur', 'nuraeni', 'nuraini', 'nurbaiti', 'nurhasanah',
  'nurhayati', 'nuri', 'nurjanah', 'nurlela', 'nurmala', 'nurul', 'nyimas', 'okta',
  'oktavia', 'oktaviani', 'ola', 'olin', 'olivia', 'padma', 'paramita', 'patricia',
  'paula', 'peggi', 'puji', 'pujiani', 'purwati', 'puspa', 'puspita', 'puti',
  'putri', 'qori', 'qoriah', 'rachel', 'rahayu', 'rahma', 'rahmawati', 'raisya',
  'rani', 'rania', 'ranti', 'rara', 'rasti', 'ratih', 'ratna', 'ratnasari',
  'ratni', 'raya', 'rayi', 'refi', 'regina', 'rena', 'reni', 'renny',
  'resti', 'resty', 'retno', 'ria', 'riana', 'rica', 'riecka', 'rieska',
  'rika', 'riki', 'rima', 'rina', 'rinda', 'rini', 'rio', 'riri',
  'ririn', 'riska', 'risma', 'rismawati', 'risna', 'risnawati', 'rita', 'riya',
  'rizka', 'rizki', 'rizkia', 'rizky', 'rizna', 'rizqia', 'rizquna', 'rofikoh',
  'rohima', 'rohmah', 'rohmatun', 'roisah', 'romlah', 'rona', 'rosa', 'rosalina',
  'rosdiana', 'rosi', 'rosida', 'rosita', 'rosma', 'rosmiati', 'rossa', 'rossi',
  'rossy', 'rostina', 'ruli', 'rury', 'rusi', 'rusti', 'ruth', 'safira',
  'safitri', 'sahara', 'saidah', 'sakina', 'sakinah', 'salma', 'salsa', 'salsabilla',
  'salwa', 'sandra', 'santi', 'santika', 'sapti', 'sarah', 'sari', 'sartika',
  'saskia', 'sasti', 'saudah', 'sekar', 'sela', 'seli', 'sella', 'selly',
  'selma', 'selvi', 'selvia', 'selviana', 'septi', 'septiani', 'septiana', 'serli',
  'sesil', 'sesilia', 'setiowati', 'shabrina', 'shafa', 'shafira', 'shania', 'shanti',
  'sheila', 'sherli', 'sherly', 'shinta', 'shintya', 'shifa', 'shofia', 'sifa',
  'silfi', 'silvi', 'silvia', 'silviana', 'sindy', 'sinta', 'sintia', 'sintya',
  'siska', 'siti', 'siva', 'sofia', 'sofie', 'sofi', 'sonia', 'sonya',
  'soraya', 'sri', 'suci', 'suciati', 'sugiarti', 'suhartini', 'suji', 'sukma',
  'sukmawati', 'sulis', 'sulistia', 'sulistiawati', 'sulastri', 'sumarni', 'sumarti', 'sumi',
  'sumiati', 'sumiyati', 'susi', 'susilawati', 'susanti', 'susan', 'syifa', 'syifaul',
  'talia', 'tamara', 'tami', 'tania', 'tanti', 'tantri', 'tanya', 'tari',
  'tasya', 'tati', 'tatat', 'taty', 'tania', 'tengku', 'tere', 'teresa',
  'teresya', 'tesa', 'thalia', 'tia', 'tiara', 'tien', 'tika', 'tina',
  'tini', 'tita', 'titik', 'titin', 'titis', 'tri', 'triana', 'triani',
  'trisna', 'tristiana', 'tuti', 'tutik', 'tyas', 'ulfa', 'ulfah', 'ulfi',
  'ulva', 'umi', 'unaisah', 'unggul', 'uni', 'upik', 'uray', 'utami',
  'utari', 'valen', 'valentina', 'valeria', 'vani', 'vania', 'vanya', 'vega',
  'vela', 'velia', 'venny', 'veny', 'vera', 'verawaty', 'veronica', 'veronika',
  'vi', 'via', 'viana', 'vicky', 'victoria', 'vida', 'vika', 'viky',
  'vina', 'vinda', 'vini', 'viona', 'vira', 'virda', 'virgie', 'virna',
  'vita', 'vivi', 'vivian', 'vivin', 'vonny', 'wahyu', 'wahyuni', 'wahyuningsih',
  'wandha', 'wardah', 'warni', 'warsini', 'warti', 'wasis', 'wati', 'wela',
  'wenny', 'widia', 'widiastuti', 'widya', 'wike', 'wilda', 'wilma', 'wina',
  'winda', 'windy', 'wining', 'winny', 'wintari', 'wita', 'wiwik', 'wiwin',
  'wulan', 'wulandari', 'wuri', 'yani', 'yanti', 'yayang', 'yeyen', 'yeni',
  'yessy', 'yeti', 'yola', 'yolanda', 'yona', 'yoshie', 'yovita', 'yulia',
  'yuliana', 'yuliani', 'yulianti', 'yulinar', 'yulis', 'yuni', 'yuniar', 'yuniarti',
  'yunita', 'yuri', 'yurike', 'yusni', 'yusnita', 'yustina', 'yuyun', 'zahra',
  'zahrina', 'zakia', 'zakiyah', 'zalfa', 'zara', 'zaskia', 'zaza', 'zelia',
  'zella', 'zelyn', 'zeny', 'zia', 'zivanna', 'ziza', 'zizah', 'zora',
  'zulaikha', 'zulfa', 'zulfah', 'zulva'
];

async function main() {
  console.log('Starting gender inference...');

  const students = await prisma.user.findMany({
    where: { role: 'STUDENT' },
  });

  console.log(`Found ${students.length} students.`);

  let updatedCount = 0;
  let maleCount = 0;
  let femaleCount = 0;

  for (const student of students) {
    const name = student.name.toLowerCase();
    let predictedGender: 'MALE' | 'FEMALE' | null = null;

    // Check specific strong indicators first
    // Note: "putra" is male, "putri" is female. "nur" can be ambiguous but mostly female unless "nur hidayat".
    // "dwi", "tri", "eka" are neutral.

    // Strong Female Indicators
    if (
      name.includes('putri') || 
      name.includes('siti ') || 
      name.includes('siti.') || 
      (name.includes('nur ') && !name.includes('nur hidayat') && !name.includes('nurhidayat')) ||
      name.includes('ayu ') || 
      name.endsWith(' ayu') ||
      name.includes('neng ')
    ) {
        predictedGender = 'FEMALE';
    } 
    // Strong Male Indicators
    else if (
      name.includes('muhammad') || 
      name.includes('mohammad') || 
      name.includes('moh.') || 
      name.includes('muh.') || 
      name.includes('ahmad') || 
      name.includes('putra')
    ) {
        predictedGender = 'MALE';
    } else {
        // Count keyword matches
        let maleScore = 0;
        let femaleScore = 0;

        const words = name.split(/[\s\.]+/); // Split by space or dot

        for (const word of words) {
            if (MALE_KEYWORDS.includes(word)) maleScore++;
            if (FEMALE_KEYWORDS.includes(word)) femaleScore++;
        }

        if (maleScore > femaleScore) {
            predictedGender = 'MALE';
        } else if (femaleScore > maleScore) {
            predictedGender = 'FEMALE';
        }
    }

    if (predictedGender && predictedGender !== student.gender) {
        await prisma.user.update({
            where: { id: student.id },
            data: { gender: predictedGender },
        });
        console.log(`Updated: ${student.name} -> ${predictedGender}`);
        updatedCount++;
        if (predictedGender === 'MALE') maleCount++;
        else femaleCount++;
    }
  }

  console.log(`Finished. Updated ${updatedCount} students.`);
  console.log(`New Males: ${maleCount}, New Females: ${femaleCount}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });