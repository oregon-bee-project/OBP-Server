#' @title Make ecoregion reports
#' @description Create ecoregion reports from iNaturalist project data, bee/plant interactions, and plant list.
#' 
#' @param plantListCSV _Required_ - CSV of plant species 
#' @param beeDataCSV _Required_ - CSV of bee/plant interactions from OBA.
#' @param beeDataColumns _Required_ - named character vector with column names from _beeDataCSV_ to use.
#' @param iNatFolder _Required_ - Folder/subfolders containing vineyard iNaturalist CSV files.
#' @param reportFolder _Required_ - Folder for writing reports to.
#' @param plDatCSV (Optional) output csv of all plant records. Skips writing if NA.
#' @param predictedBeesCSV (Optional) output csv of predicted bees for each project. Skips writing if NA.
#' @param dataStoragePath (Optional) .Rdata storage path for internal function data. Skips writing if NA.
#' 
#' @return Nothing - writes to plDatCSV, predictedBeesCSV, or dataStoragePath
#' @export
#' 
#' @details 
#' _beeDataColumns_ must have the following column names (see examples):
#' _CollectorName, Sex, ForagePlant, Method, Month, Day, Year, County,_ 
#' _ Genus, Species, Latitude, Longitude_
#'
#' @examples 
#' 
#' #Column from beeDataCSV to use
#' bNames = c("CollectorName" = "Collectors.1", "Sex" = "sex", "ForagePlant" = "Associated.plant", 
#'   "Method" = "Collectionmethod", "Month" = "MonthJul", "Day" = "MonthAb", 
#'   "Year" = "Year.1", "County" = "County", "Genus" = "Genus", "Species" = "Species" ,
#'   "Latitude" = "Dec..Lat.", "Longitude" = "Dec..Long.") 
#' 
#' #Create reports
#' makeReports2(plantListCSV = './cleanedPlantList2024.csv',
#'   beeDataCSV = './OBA_2017_2023_v16Oct24.csv',
#'   beeDataColumns = bNames, 
#'   iNatFolder =  './iNat records',
#'   reportFolder = './reports',
#'   plDatCSV = NA, predictedBeesCSV = NA, dataStoragePath = NA)
#' 
makeReports2 <- function(plantListCSV = NA, 
                        beeDataCSV = NA, 
                        beeDataColumns = NA,
                        iNatFolder = NA,
                        reportFolder = NA,
                        plDatCSV = NA,
                        predictedBeesCSV = NA,
                        dataStoragePath = NA,
                        famGenPath = NA
){
  
  # #Debug
  # devtools::load_all(".") #Load package
  # plantListCSV = "C:\\Users\\s_robinson\\Ducks Unlimited Canada\\IWWR Team - Documents\\Sustainable Agriculture\\External Collaborative Projects\\OSU Vineyard Project 2024-26\\stewardshipReports2026\\PLANTS_CLEAN_2026-05-08.csv"
  # beeDataCSV = "C:\\Users\\s_robinson\\Ducks Unlimited Canada\\IWWR Team - Documents\\Sustainable Agriculture\\External Collaborative Projects\\OSU Vineyard Project 2024-26\\stewardshipReports2026\\workingOccurrences2026_04_01.csv"
  # beeDataColumns = c("CollectorName" = "recordedBy", "Sex" = "sex", "ForagePlant" = "speciesPlant",
  #                    "Method" = "samplingProtocol", "Month" = "month", "Day" = "day",
  #                    "Year" = "year", "County" = "county", "Genus" = "genus", "Species" = "specificEpithet" ,
  #                    "Latitude" = "decimalLatitude", "Longitude" = "decimalLongitude")
  # iNatFolder = "C:\\Users\\s_robinson\\Ducks Unlimited Canada\\IWWR Team - Documents\\Sustainable Agriculture\\External Collaborative Projects\\OSU Vineyard Project 2024-26\\stewardshipReports2026\\inatCSVs\\"
  # reportFolder = "C:\\Users\\s_robinson\\Ducks Unlimited Canada\\IWWR Team - Documents\\Sustainable Agriculture\\External Collaborative Projects\\OSU Vineyard Project 2024-26\\stewardshipReports2026\\reportFolder\\"
  # plDatCSV = NA
  # predictedBeesCSV = NA
  # dataStoragePath = NA
  # famGenPath = "C:\\Users\\s_robinson\\OneDrive - Ducks Unlimited Canada\\Documents\\Projects\\Git Repos\\vineyardReportsOSU\\inst\\extdata\\famGenLookup.csv"
  # ecoregShpPath = "C:\\Users\\s_robinson\\Ducks Unlimited Canada\\IWWR Team - Documents\\Sustainable Agriculture\\External Collaborative Projects\\OSU Vineyard Project 2024-26\\data\\shapefiles\\NA_ecoregions.gpkg"
  # stateProvShpPath = "C:\\Users\\s_robinson\\Ducks Unlimited Canada\\IWWR Team - Documents\\Sustainable Agriculture\\External Collaborative Projects\\OSU Vineyard Project 2024-26\\data\\shapefiles\\NA_statesProvs.gpkg"
  # beeAbstractsPath = NA
  # vy = 6
  # rmdPath = "C:\\Users\\s_robinson\\OneDrive - Ducks Unlimited Canada\\Documents\\Projects\\Git Repos\\vineyardReportsOSU\\inst\\rmdTemplates\\ecoregion-report-template.Rmd"
  
  # Preamble ---------------------------
  
  library(ggplot2)
  theme_set(theme_classic())
  library(dplyr)
  library(tidyr)
  library(stringr)
  library(rlang)
  library(tibble)
  library(knitr)
  library(sf)
  library(vegan)
  library(bipartite)
  library(rmarkdown)
  
  #Convenience function
  rmBadChar <- function(x) gsub("[^a-zA-Z0-9:'-.]",' ',x,perl = TRUE) #Gets rid of nonstandard characters that screw up LaTeX reports - leaves dashes, colons, apostrophes, periods
  
  #BS checking
  
  #Mandatory input
  chkInputs <- sapply(c(plantListCSV,beeDataCSV),function(x) !is.na(x)&file.exists(x))
  if(any(!chkInputs)){
    stop(paste0('Input ', paste0(c('plantListCSV','beeDataCSV')[!chkInputs],collapse=', '),' must be specified correctly. Check that path is specified and files exist'))
  } 
  
  chkInputs <- sapply(c(iNatFolder,reportFolder),function(x) !is.na(x)&dir.exists(x))
  if(any(!chkInputs)){
    stop(paste0('Input ', paste0(c('iNatFolder','reportFolder')[!chkInputs],collapse=', '),' must be specified correctly. Check that path is specified and directory exists.'))
  } 
  
  #Required column names
  reqBNames <- c("CollectorName","Sex","ForagePlant","Method","Month","Day","Year",
                 "County","Genus","Species","Latitude","Longitude")
  
  if(any(any(is.na(beeDataColumns))|length(beeDataColumns)!=length(reqBNames)|any(!names(beeDataColumns) %in% reqBNames))){
    stop(paste0('beeDataColumns must be a named character vector with the following names:\n',
                paste0(reqBNames,collapse=', ')))
  }
  
  #Optional input
  chkInputs <- sapply(c(famGenPath),function(x) is.na(x)||file.exists(x))
  if(any(!chkInputs)){
    stop(paste0('Input ', paste0(c('famGenPath')[!chkInputs],collapse=', '),' must be specified correctly. Check that path is specified and files exist'))
  }
  
  #Get paths to iNaturalist csvs
  csvPaths <- list.files(iNatFolder,full.names = TRUE, recursive = TRUE,pattern = '.csv') #Gets list of csvs in "./data" folder
  
  #Bee family-genus lookup
  famGen <- read.csv(ifelse(is.na(famGenPath),system.file('extdata','famGenLookup.csv',package=packageName(),mustWork = TRUE),famGenPath)) %>% 
    select(Family,Genus) %>% #Cut out Tribe/Subfamilies
    rename(lookupFam=Family) #Bee genus-family lookup table
  
  # Load and clean up regional plant data -------------------------
  print('Loading regional plant data')
  
  plantList <- read.csv(plantListCSV,strip.white = TRUE,encoding = 'UTF-8') 
  
  reqPlantCols <- c('Scientific_name','Synonym','Common_name','Bloom_start',
                    'Bloom_end','Lifecycle','Origin','Garden_type','Family','PlantAbstract')
  
  #Checks columns
  if(any(!reqPlantCols %in% colnames(plantList))){ 
    stop(paste0('Regional plant list must have the following columns:\n',paste0(reqPlantCols,collapse='\n')))
  }
  
  #Gets rid of varietal or subspecies records
  chooseThese <- grepl('(var|ssp)\\.',plantList$Scientific_name)
  if(any(chooseThese)){
    message(paste0("Plant names with 'var' or 'ssp' found in plant list. Excluded ",sum(chooseThese)," from plant list\n",
                   paste(plantList$Scientific_name[chooseThese],collapse = '\n'),'\n'))
    Sys.sleep(1)
    plantList <- plantList %>% filter(!chooseThese)  
  }
  
  #Gets rid of family or higher level taxonomy records
  chooseThese <- grepl('^\\S+(ales|eae|dae|nae)$',plantList$Scientific_name)
  if(any(chooseThese)){
    message(paste0("Orders, families, or other non-genus groups found in plant list. Excluded ",sum(chooseThese)," from plant list\n",
                   paste(plantList$Scientific_name[chooseThese],collapse = '\n'),'\n'))
    Sys.sleep(1)
    plantList <- plantList %>% filter(!chooseThese)  
  }
  
  #Gets rid of triple names
  chooseThese <- grepl('\\s.*\\s.*$',plantList$Scientific_name)
  if(any(chooseThese)){
    message(paste0("Triple names (possibly varieties or culivars) found in plant list. Excluded ",sum(chooseThese)," from plant list\n",
                   paste(plantList$Scientific_name[chooseThese],collapse = '\n'),'\n'))
    Sys.sleep(1)
    plantList <- plantList %>% filter(!chooseThese)  
    # Could fix by removing the end of triple-names (varieties), but leads to problems with duplicate plant names 
    # - let the user figure this out
    # mutate(Scientific_name=sapply(strsplit(Scientific_name,' '),function(x) paste0(x[1:pmin(length(x),2)],collapse=' '))) 
  }
  
  plantList <- plantList %>% 
    filter(Scientific_name!='') %>% rowwise() %>% #Removes blanks
    mutate(Scientific_name=ifelse(grepl('\\s',Scientific_name),Scientific_name,paste0(Scientific_name,' spp.'))) %>% #Adds spp to genus
    mutate(Synonym=sapply(strsplit(Synonym,'\\s*,\\s*'),function(x){ #Adds spp to sub-strings of synonym column, if needed
      if(length(x)==0){
        return("")
      } else {
        paste0(sapply(x, function(y) if(!grepl(' ',y)) paste0(y,' spp.') else y),collapse=', ')
      }
    })) %>% ungroup() %>% 
    mutate(Common_name=str_to_title(gsub(',.*','',Common_name))) %>% #Removes all but first common name, and capitalizes
    mutate(across(c(Scientific_name,Common_name,PlantAbstract),~rmBadChar(.x))) %>% #Get rid of nonstandard punctuation marks
    mutate(Lifecycle=str_to_title(Lifecycle)) %>% 
    rename(isNoxious=Noxious_weed,isWeedy=Weedy_species) 
    
  #Adds columns of plant traits 
  plantList <- plantList %>% 
    mutate(isNative=grepl('(N|n)ative',Origin,)) %>%
    mutate(isWeedy=ifelse(isNoxious,FALSE,isWeedy)) %>% #Removes noxious species from weedy (non-overlapping sets)
    mutate(isLandscape=grepl('landscape',Garden_type),isEdge=grepl('edge areas',Garden_type),
           isRiparian=grepl('riparian',Garden_type),isOpen=grepl('open areas',Garden_type),
           isOakWoodland=grepl('oak woodland',Garden_type),isWetland=grepl('seasonally wet',Garden_type)) #Assigns garden type - clunky, but works
  
  #Test for duplicate names
  if(any(table(plantList$Scientific_name)>1)){
    dupPlants <- names(which(table(plantList$Scientific_name)>1)) #Duplicated plants
    
    message(paste0('Duplicate scientific names found in plant list:\n',
                   paste0(names(which(table(plantList$Scientific_name)>1)),collapse = '\n'),
                   '\n\nRemoving all records but first in the database'))
    for(i in 1:length(dupPlants)){
      plantList <- plantList %>% slice(-c(which(Scientific_name == dupPlants[i])[-1]))
    }
    rm(dupPlants,i)
  }
  
  #List of non-native plants - also includes ones not found in complete plant list (possibly misidentified)
  nonNativeSpp <- plantList %>% select(Scientific_name,isNative) %>% 
    filter(grepl('\\s',Scientific_name)) %>% filter(!isNative) %>% 
    pull(Scientific_name)
  
  # Load and clean up bee data ------------------------------------
  print('Loading regional bee data')
  beeData <- read.csv(beeDataCSV,stringsAsFactors = FALSE,
                      strip.white = TRUE,na.strings=c('NA',''))
  
  #Check input names
  if(any(!reqBNames %in% names(beeDataColumns))|any(!names(beeDataColumns) %in% reqBNames)){
    stop(paste0('beeDataColumns must be a named character vector with the following names:\n',
                paste0(reqBNames,collapse=', '),'\n\nNames provided:\n',
                paste0(names(beeDataColumns),collapse=', '),'\nSee example in help file'))
  }
  
  #Check input column names from csv
  if(any(!beeDataColumns %in% names(beeData))){
    stop(paste0('Column names not found in ',basename(beeDataCSV),':\n',
                paste0(beeDataColumns[!beeDataColumns %in% names(beeData)],collapse='\n')))
  }

  beeData <- beeData %>% select(all_of(beeDataColumns)) %>% #Select/rename columns
    filter(!is.na(Genus)) %>% #Filter empty records
    transmute(CollectorName,Sex,ForagePlant,Method,Date=paste(Month,Day,Year),County,
              Order='Hymenoptera',Family=NA,Genus,Species,genSpp=NA,plantGenus=NA,plantSpp=NA,
              Latitude,Longitude) %>%
    mutate(across(where(is.character),~str_trim(.))) %>% #Trim whitespace across columns
    mutate(Date=as.Date(Date,format='%B %d %Y')) %>% #Create date
    mutate(Genus=str_to_title(Genus),Genus=gsub('\\s.*$','',Genus)) %>% #Capitalize spp names,remove subgenera
    mutate(Family=famGen$lookupFam[match(Genus,famGen$Genus)]) %>% #Match genus to family  
    filter(!is.na(Family)) %>% #Gets rid of genera with no matching bee family
    mutate(Family=ifelse(Genus=='Anthophorini','Apidae',Family),
           Family=ifelse(Genus=='Anthophorini',NA,Family)) %>% #Fix tribe name
    makeGenSpp(Genus,Species) #Make genSpp column
  
  chooseThese <- grepl('\\s\\(.+$',beeData$ForagePlant) #Gets rid of brackets+text after ForagePlant
  if(any(chooseThese)){
    message(paste0("Removed brackets and extra text after intial ForagePlant name in bee list. Altered ",sum(chooseThese)," records from bee list\n",
                   paste(apply(cbind(unique(na.omit(beeData$ForagePlant[chooseThese])),
                                     paste(gsub('\\s\\(.+$','',unique(na.omit(beeData$ForagePlant[chooseThese]))))),1,
                               paste,collapse=' -> '),collapse='\n'),'\n'))
    Sys.sleep(1)
    beeData <- beeData %>% mutate(ForagePlant=gsub('\\s\\(.+$','',ForagePlant)) 
  }
  
  chooseThese <- grepl('(\\s.\\s.*$|\\s.$)',beeData$ForagePlant)#Gets rid of hybrid x marks
  if(any(chooseThese)){
    message(paste0("Hybrid names, x marks, or other non-standard text found in ForagePlant names in bee list. Altered ",sum(chooseThese)," records from bee list\n",
                   paste(apply(cbind(unique(na.omit(beeData$ForagePlant[chooseThese])),
                                     paste(gsub('(\\s.\\s.*$|\\s.$)','',unique(na.omit(beeData$ForagePlant[chooseThese]))))),1,
                               paste,collapse=' -> '),collapse='\n'),'\n'))
    Sys.sleep(1)
    beeData <- beeData %>% mutate(ForagePlant=gsub('(\\s.\\s.*$|\\s.$)','',ForagePlant)) #Replace text 
  }
  
  chooseThese <- grepl('(^\\S+(ales|eae|dae|nae)$|Composite)',beeData$ForagePlant) #Gets rid of higher-level names
  if(any(chooseThese)){
    message(paste0("Orders, families, or other non-genus groups found in ForagePlant names in bee list. Removed ",sum(chooseThese)," records from bee list\n",
                   paste(unique(na.omit(beeData$ForagePlant[chooseThese])),collapse='\n'),'\n'))
    Sys.sleep(1)
    beeData <- beeData %>% 
      mutate(ForagePlant=ifelse(grepl('(^\\S+(ales|eae|dae|nae)$|Composite)',ForagePlant),NA,ForagePlant)) #Set as NA
  }
  
  chooseThese <- grepl('(,|^\\S+\\s\\S+\\s.*$)',beeData$ForagePlant) #Gets rid of triple-names or varietals in ForagePlant species
  if(any(chooseThese)){
    
    badNames <- beeData$ForagePlant[chooseThese] #Names to replace
    
    beeData <- beeData %>% 
      mutate(ForagePlant=case_when(is.na(ForagePlant) ~ NA_character_,
                                   grepl('Ã—',ForagePlant) ~ gsub(' Ã—.*','',ForagePlant), #Removes hybrid character, changes to genus only
                                   #Removes varietal, keeps genus + spp
                                   str_count(ForagePlant,' ')>1 ~ sapply(str_split(ForagePlant,' '), function(x) paste0(x[1:pmin(2,length(x))],collapse=' ')), 
                                   .default = ForagePlant
                                   ))
    newNames <- beeData$ForagePlant[chooseThese] #Replacement names
    
    message(paste0("Lists of plants or triple-name varietals found in ForagePlant names in bee list. Altered ",sum(chooseThese)," records from bee list\n\n",
    paste(apply(unique(cbind(badNames,newNames)),1,paste,collapse=' -> '),collapse = '\n'),'\n'))
    Sys.sleep(1)
    rm(badNames,newNames,chooseThese)
  }
  
  beeData <- beeData %>% 
    mutate(ForagePlant=case_when( #Get rid of weird plant records
      grepl('^(N|n)et\\s*$',ForagePlant) ~ NA, #"Net"
      !grepl('\\s',ForagePlant) & !is.na(ForagePlant) ~ paste0(ForagePlant,' spp.'), #Adds "spp." to singletons
      .default = gsub('sp+\\.*$','spp.',as.character(ForagePlant)
      ))) %>% ungroup() %>% 
    mutate(ForagePlant=replaceSynonyms(ForagePlant,plantList$Scientific_name,plantList$Synonym)) %>% #Replace plant synonyms
    mutate(plantGenus=gsub("\\s.+$","",ForagePlant), #Separates ForagePlant into genus and spp
           plantSpp=ifelse(grepl(" ",ForagePlant),gsub("^\\w+\\s","",ForagePlant),NA)) %>%
    mutate(plantSpp=ifelse(plantSpp=='spp.',NA,plantSpp)) %>%
    mutate(across(c(ForagePlant),~rmBadChar(.x))) %>% #Get rid of remaining nonstandard characters
    mutate(across(c(ForagePlant),~gsub('  ',' ',.x))) %>% #Get rid of double spaces produced by replacing nonstandard characters
    filter(!is.na(ForagePlant)) %>% #Remove records with no forage plant
    filter(!is.na(Latitude)&!is.na(Longitude)) %>% 
    st_as_sf(coords=c('Longitude','Latitude')) %>% #Set lon and lat as coordinates
    st_set_crs(4269) %>% #Set coordinate reference system (NAD83)
    st_transform(3643) #Transform to Oregon Lambert system
  
  #Common names for bee families
  commonFam <- data.frame(Family=factor(c('Andrenidae','Apidae','Colletidae','Halictidae','Megachilidae')),
                          common=c('Mining bees','Bumble bees and Allies','Polyester bees','Sweat bees','Leaf-cutting bees')) %>%
    mutate(plotLab=paste0(Family,'\n(',common,')'))
  
  #Check whether species in bee data are found in plant database
  foragePlantMissing <- sort(unique(beeData$ForagePlant[!beeData$ForagePlant %in% plantList$Scientific_name]))
  
  if(length(foragePlantMissing)>0){
    message(paste0(length(foragePlantMissing), " forage plant species in bee database were not found in plant list:\n\n",
                   paste(foragePlantMissing,collapse = '\n'),'\n'))
    Sys.sleep(1)
  }
  
  # Load ecoregion/state province polygons ------------------------
  print('Loading ecoregion/state/province polygons')
  
  #Shapefiles of North American ecoregions
  
  #Gets path from internal data
  ecoregShpPath <- system.file('shapefiles','NA_ecoregions.gpkg',package=packageName(),mustWork = TRUE)
  ecoReg <- st_read(ecoregShpPath,quiet = TRUE) %>% rename(geometry=geom)
  
  if(any(!c('EcoRegName','ProvStateName','CountryName','geometry') %in% colnames(ecoReg))){
    stop(paste0('Ecoregion shapefiles must have the following columns:\n',paste0(c('EcoRegName','ProvStateName','CountryName','geometry'),collapse='\n')))
  }
  
  ecoReg <- ecoReg %>% rename(name=EcoRegName) %>% #Read in ecoregions
    st_transform(3643) %>% #Transform to Oregon Lambert
    group_by(name) %>% summarize(across(-geometry,first),geometry=st_union(geometry)) %>% ungroup() %>% #Union separate polygons
    mutate(name=gsub(' and ',' & ',name)) #Replace "and" with "&"
    # mutate(name=gsub('Cascades Slopes','Cascades\nSlopes',name)) #Add line break (\n) to "Cascades Slopes"
  
  #Overwrite county name using shapefiles, using lat/lon data from individual records
  
  #Get ecoregion
  beeData$ecoreg <- gsub('\n',' ',ecoReg$name)[st_within_fast(beeData,ecoReg)] #Get rid of carriage return in ecoregion name
  # ecoReg %>% filter(name %in% unique(beeData$ecoreg)) %>% ggplot()+geom_sf()+geom_sf(data=beeData,col='red') #Works
  if(any(is.na(beeData$ecoreg))){
    message(paste0(sum(is.na(beeData$ecoreg)),' bee samples not within ecoregion polygons discarded\n'))
    Sys.sleep(1)
    beeData <- beeData %>% filter(!is.na(ecoreg))
  }
  
  #Test for repeated spaces
  if(any(apply(st_drop_geometry(beeData),2,function(x) any(grepl('  ',sort(unique(x))))))){
    stop('Double spaces "  " found in bee data')
    apply(st_drop_geometry(beeData),2,function(x) any(grepl('  ',sort(unique(x)))))
  }
  
  mi2km <- 1.609344 #Miles per kilometer
  
  #Load state/province polygons
  stateProvShpPath <- system.file('shapefiles','NA_statesProvs.gpkg',package=packageName(),mustWork = TRUE)
  stateProvs <- st_read(stateProvShpPath,quiet = TRUE) %>% rename(geometry=geom)
  
  #Load and clean up iNaturalist records ------------------------
  print('Loading iNaturalist records')
  #Function to get CSV files
  getCSVs <- function(x){ 
    l <- read.csv(x,strip.white = TRUE,sep = ',') #Read in csvs
    reqCols <- c('latitude','longitude','scientific_name','common_name','observed_on') #Required columns names
    if(any(!reqCols %in% colnames(l))){ #If observed_on not found in iNat record
      stop(paste0('Columns missing from iNaturalist record: ',x,'. Required columns: ',paste0(reqCols,collapse = ', ')))
    }
    l <- l %>% select(any_of(reqCols)) %>% #Select relevant columns
      mutate(vineyard=gsub('.csv','',basename(x))) #Gets name
    return(l)
  }
  
  #Get all CSVs and assemble into single dataframe
  iNatPlDat <- lapply(csvPaths,getCSVs) %>% bind_rows() %>% tibble() %>% 
    mutate(year=format(as.Date(observed_on,format='%Y-%m-%d'),format='%Y')) %>% #Gets year, but date format changes...
    filter(!is.na(latitude)) %>% 
    filter(!grepl('eae$',scientific_name)) %>% #Removes family
    filter(!scientific_name %in% unique(beeData$genSpp)) %>% #Removes bee names (didn't record plant)
    mutate(scientific_name=gsub('(\\s.\\s.*$|\\s.$)','',scientific_name)) %>% #Removes hybrid "x" markings
    mutate(across(c(scientific_name),~rmBadChar(.x))) %>% #Get rid of remaining nonstandard characters
    mutate(scientific_name=ifelse(!grepl('\\s',scientific_name),paste0(scientific_name,' spp.'),scientific_name)) %>% #Adds spp. to end of genus
    mutate(scientific_name=sapply(strsplit(scientific_name,'\\s'),function(x) paste0(x[1:2],collapse=' '))) %>% #Drops last word in triple names (e.g. Eriophyllum lanatum integrifolium -> Eriophyllum lanatum)
    mutate(scientific_name=replaceSynonyms(scientific_name,plantList$Scientific_name,plantList$Synonym)) %>% #Replace plant synonyms
    mutate(plGenus=gsub('\\s.*','',scientific_name)) %>% 
    mutate(common_name=str_to_title(gsub(',.*','',common_name))) %>% #Capitalizes common names, and chooses only first one (if separated by commas)
    st_as_sf(coords=c('longitude','latitude')) %>% #Set lon and lat as coordinates
    st_set_crs(4269) %>% #Set coordinate reference system (NAD83)
    st_transform(3643) 
  
  #Check date format
  badDates <- is.na(iNatPlDat$year) | as.numeric(iNatPlDat$year)<2010
  if(any(badDates)){
    stop(paste0('Date format not recognized in the following iNat projects:\n',
                iNatPlDat %>% st_drop_geometry() %>% filter(badDates) %>% pull(vineyard) %>% unique() %>% paste0(.,collapse=','),
                '\nobserved_on column must be in YYYY-MM-DD format'))
  }
  
  #Join ecoregions/states/provinces to iNat plantdata
  iNatPlDat$ecoreg <- gsub('\n',' ',ecoReg$name)[st_within_fast(iNatPlDat,ecoReg)] #Get rid of carriage return in ecoregion name
  # ecoReg %>% filter(name %in% unique(iNatPlDat$ecoreg)) %>% ggplot()+geom_sf(aes(fill=name))+geom_sf(data=iNatPlDat,col='red') #Works
  if(any(is.na(iNatPlDat$ecoreg))){
    message(paste0(sum(is.na(iNatPlDat$ecoreg)),' samples not matching ecoregions discarded\n'))
    Sys.sleep(1)
    iNatPlDat <- iNatPlDat %>% filter(!is.na(ecoreg))
  }
  
  #Join state/province/country data onto iNat plant dat
  iNatPlDat$stateProv <- stateProvs$NAME_En[st_within_fast(st_transform(iNatPlDat,st_crs(stateProvs)),stateProvs)]
  iNatPlDat$country <- stateProvs$COUNTRY[st_within_fast(st_transform(iNatPlDat,st_crs(stateProvs)),stateProvs)] 
  
  iNatProjNames <- gsub('.csv','',sort(unique(basename(csvPaths)))) #Names names from csv paths
  
  if(any(!iNatProjNames %in% unique(iNatPlDat$vineyard))){ #If there are any vineyards that have been completely filtered out  (empty)
    message(paste0('Some projects were not present after iNat record filtering. Check to make sure the locations of iNat records are within ecoregions, and that they contain plant genus information:\n\n',
                   paste(iNatProjNames[!iNatProjNames %in% unique(iNatPlDat$vineyard)],collapse='\n')))
    Sys.sleep(1)
    iNatProjNames <- unique(iNatPlDat$vineyard) #Rewrites iNat plantnames if some are missing
  }
  
  if(!is.na(plDatCSV)){ #If path provided
    #Write all iNat records to single csv
    iNatPlDat %>% st_transform(4269) %>% 
      mutate(lat=st_coordinates(.)[,2],lon=st_coordinates(.)[,1]) %>% 
      st_drop_geometry() %>% 
      write.csv(.,file = plDatCSV,row.names = FALSE)
  }
  
  # Write list of missing/present species to csv --------------------------------------
  
  plantDataSummary <- list('inPlantDatabase'=sort(unique(plantList$Scientific_name)),
       'inBeeForagePlants'=sort(unique(beeData$ForagePlant)),
       'inINatPlants'=sort(unique(iNatPlDat$scientific_name))
  ) %>% lapply(.,function(x) data.frame('PlantSpp'=x)) %>% bind_rows(.id = 'dataset') %>% 
    mutate(valCol=TRUE) %>% pivot_wider(names_from=dataset,values_from=valCol,values_fill = FALSE)
  
  if(sum(apply(plantDataSummary[,-1],1,function(x) any(!x)))>0){
    message(paste0(sum(apply(plantDataSummary[,-1],1,function(x) any(!x))),' plants missing from plant database, bee forage plant records, or iNaturalist records:\n\n'))
    temp <- ftable(xtabs(~inPlantDatabase+inBeeForagePlants+inINatPlants,data = plantDataSummary),row.vars = 1:3) #Contingency table
    attr(temp,'col.vars') <- 'Number of Plants' #Renames column
    print(temp)
    message(paste0('Writing plant data summary csv to:\n\n ',file.path(reportFolder,'plantDataSummary.csv')))
    write.csv(arrange(plantDataSummary,grepl('spp.',PlantSpp),PlantSpp), #Writes to csv in report folder
              file.path(reportFolder,'plantDataSummary.csv'),row.names = FALSE)
    Sys.sleep(1)
  }
  
  # Make regional and project-level networks ------------------------------------
  print('Creating regional networks')
  # Gets unique plant records and associated bee records from the 2024 bee data. Used to generate a list of "highlight" bees and plants for growers
  
  #Create ecoregions-specific networks (all interactions from a given region). Should eventually turn into a stand-alone function. Could also make a general-purpose version that works with arbitrary subsets (would replace both getRegNtwks and getInatNtwks?)
  getRegNtwks <- function(nm,bdat,pList){ #nm = ecoregion name, bdat = bee/plant interaction data, pList = plant list with traits
    if(nm=='ALL'){ #Uses entire interaction dataset
      d <- bdat %>% st_drop_geometry()
    } else {
      d <- bdat %>% filter(ecoreg==nm) %>% st_drop_geometry() #Filters data to ecoregion. Could use some kind of tidyr nested dataframe approach
    }

    #matrix: Bee spp -> plant spp (all)
    ntwk_all <- d %>% filter(!is.na(Species),!is.na(plantSpp)) %>%
      select(genSpp,ForagePlant) %>% na.omit() %>%
      left_join(select(pList,Scientific_name,isWeedy,isNoxious,isNative), #Joins in plant traits
                by = c('ForagePlant'='Scientific_name')) %>%
      count(genSpp,ForagePlant) %>%
      pivot_wider(names_from=ForagePlant,values_from=n,values_fill = 0) %>%
      column_to_rownames('genSpp') %>% as.matrix() %>% t()
    
    #matrix: Bee spp -> plant spp (nonweedy non-noxious only)  - recommended plant spp for growers
    ntwk_noWeed <- d %>% filter(!is.na(Species),!is.na(plantSpp)) %>%
      select(genSpp,ForagePlant) %>% na.omit() %>%
      left_join(select(pList,Scientific_name,isWeedy,isNoxious,isNative),  #Joins in plant traits
                by = c('ForagePlant'='Scientific_name')) %>%
      filter(!is.na(isWeedy),!isNoxious,!isWeedy) %>%
      count(genSpp,ForagePlant) %>%
      pivot_wider(names_from=ForagePlant,values_from=n,values_fill = 0) %>%
      column_to_rownames('genSpp') %>% as.matrix() %>% t()
    
    #Which bees are rare? - using a simple definition (>median)
    rareBees <- d %>% filter(!is.na(Species)) %>% 
      count(genSpp) %>% arrange(desc(n)) %>%
      filter(n<median(n))
    
    if(any(dim(ntwk_noWeed)==0)){
      if(any(dim(ntwk_all)==0)){
        message('No plant species data found for ',nm,'\n')
      } else{
        message('No non-weedy species plant data for ',nm,'\n')  
      }
      Sys.sleep(1)
      topSpp <- topGen <- NA
    } else {
      #Plant species for ecoregion (based on Chao1 richness from plant spp - bee spp network)
      #Uses ntwk_noWeed - excludes weeds and nonnative
      topSpp <- vegan::estimateR(ntwk_all) %>% t() %>% data.frame() %>% 
        rownames_to_column('plantSpp') %>%select(plantSpp:S.chao1) %>% 
        arrange(desc(S.chao1)) %>% rename(Nbees=S.obs,Nbees_estim=S.chao1) %>%
        mutate(Nbees_rare=rowSums(ntwk_all[,colnames(ntwk_all) %in% rareBees$genSpp,drop=FALSE])) %>%
        arrange(desc(Nbees)) 
      
      #Join in plant trait information from pList - retains weedy, noxious, nonnative
      topSpp <- select(pList,Scientific_name,Common_name,Lifecycle,isWeedy,isNoxious,isNative,Bloom_start,Bloom_end) %>% 
        filter(!grepl('spp.',Scientific_name)) %>% 
        right_join(topSpp,by=c('Scientific_name'='plantSpp')) %>% 
        #Creates plant "quality" rankings, based on number of rare bees hosted (>0) and overall visitor richness (>median)
        mutate(quality=case_when( #Cutoffs for forage plant "quality"
          Nbees_estim >median(Nbees_estim) & Nbees_rare >0 ~ 'super',
          xor(Nbees_estim > median(Nbees_estim),Nbees_rare >0) ~ 'good',
          TRUE ~ 'poor')) %>% 
        mutate(quality=factor(quality,levels=c('super','good','poor')))
      
      #dataframe: Bee spp that visit each flower spp
      sppList <- d %>% filter(!is.na(Species),!is.na(plantSpp)) %>%
        select(genSpp,ForagePlant) %>% na.omit() %>%
        group_by(ForagePlant) %>%
        summarize(beeSpp=paste0(genSpp,collapse = ','))
      
      #Join bee species for each flower
      sppList <- topSpp %>% left_join(sppList,by=c('Scientific_name'='ForagePlant'))
      
    }
    
    #Output list
    return(list('sppList'=sppList, #Summary list of all plant species
                'ntwk_all'=ntwk_all, #Network matrix
                'ntwk_noWeed'=ntwk_noWeed, #Network matrix - no weeds/noxious plants
                'rareBees'=rareBees)) #List of rare bees
  }
  
  useEcoReg <- c(ecoReg$name[ecoReg$name %in% unique(iNatPlDat$ecoreg)],'ALL') #Get names of ecoregions to use + "ALL"
  
  #Assemble regional networks into a list
  ecoRegNetworks <- lapply(useEcoReg,getRegNtwks,bdat=beeData,pList=plantList) %>% set_names(useEcoReg)
  
  #Get associated states/provinces for each ecoregion
  ecoRegStatProvs <- c(filter(ecoReg,name %in% names(ecoRegNetworks)[names(ecoRegNetworks)!='ALL'])$ProvStateName, #Individual ecoregions
    paste0(unique(unlist(strsplit(filter(ecoReg,name %in% useEcoReg)$ProvStateName,','))),collapse=',')) #All ecoregions
  #Get countries for each ecoregion
  ecoRegCountries <- c(filter(ecoReg,name %in% names(ecoRegNetworks)[names(ecoRegNetworks)!='ALL'])$CountryName, #Individual countries
                       paste0(unique(unlist(strsplit(filter(ecoReg,name %in% useEcoReg)$CountryName,','))),collapse=',')) #All countries
  
  #Add state/prov names to ecoregion networks
  ecoRegNetworks <- Map(function(er,ersp) c(list(ProvStateName=ersp),er), ecoRegNetworks,ecoRegStatProvs)
  ecoRegNetworks <- Map(function(er,ersp) c(list(CountryName=ersp),er), ecoRegNetworks,ecoRegCountries) 
  
  #Get unique interaction matrices for each unique iNat project
  
  #Get networks for individual iNat projects using regional data
  getInatNtwks <- function(vy,vpDat,erNtwk){ #vy = iNat project name, vpDat = plant data to select iNat project project from, erNtwk = full ecoregion network
    vyPlantSpp <- vpDat %>% st_drop_geometry() %>% 
      filter(vineyard==vy) %>% #Plant species list for this iNat project
      distinct() %>% filter(scientific_name!=plGenus) %>% 
      pull(scientific_name)
    vyPlantGen <- unique(gsub('\\s.+$','',vyPlantSpp)) #Plant genus list for this iNat project
    vyEcoreg <- unique(vpDat$ecoreg[vpDat$vineyard==vy]) #Ecoregion for this iNat project
    vyStateProv <- unique(vpDat$stateProv[vpDat$vineyard==vy]) #stateProv  for this iNat project
    vyCountry <- unique(vpDat$country[vpDat$vineyard==vy]) #Country for this iNat project
    if(length(vyEcoreg)!=1) stop('More than 1 ecoregion per iNat project')
    #Ecoregion network
    ecoregNtwk_summary <- c('ecoRegName'=vyEcoreg,
                            'stateProvName'=vyStateProv,
                            'countryName'=vyCountry,
                            lapply(list('ntwk_all'=erNtwk[[vyEcoreg]]$ntwk_all,
                                        'ntwk_noWeed'=erNtwk[[vyEcoreg]]$ntwk_noWeed),function(x){
                              c('Nsamples'=sum(x),'Nrichness'=sum(x>0),
                                'Nplants'=nrow(x),'Nbees'=ncol(x))  
                            })) 
    #Lists of species and genus (subset of regional lists)
    m <- list(
      #List of plant species along with associated bee species
      'sppList'= filter(erNtwk[[vyEcoreg]]$sppList,Scientific_name %in% vyPlantSpp) 
    )
    
    if(any(nrow(m)==0)){
      message(paste('No plants from',vy,'project found in',vyEcoreg,'plant list\n'))
      Sys.sleep(1)
    }
    
    #Matrices of: full iNat plant network + Non-weedy iNat plant network
    n <- lapply(list('ntwk'=erNtwk[[vyEcoreg]]$ntwk_all, #Uses ecoregion network
                     'ntwk_noWeed'=erNtwk[[vyEcoreg]]$ntwk_noWeed, #Ecoregion network without weeds
                     'ntwk_all'=erNtwk[['ALL']]$ntwk_all, #Uses full network
                     'ntwk_all_noWeed'=erNtwk[['ALL']]$ntwk_noWeed #Full network without weeds
    ),function(x){
      if(any(rownames(x) %in% vyPlantSpp)){
        x <- x[rownames(x) %in% vyPlantSpp,,drop=FALSE] #Remove plants that aren't found in plant name list
        x <- x[,colSums(x)>0,drop=FALSE] #Remove bees that have no interactions
        return(x)
      } else {
        message(paste('No plants from',vy,'iNat plant found in',vyEcoreg,'interaction network\n'))
        return(NA)
      } 
    })
    return(c(list('ecoregNtwk_summary'=ecoregNtwk_summary),m,n))
  }
  
  #Get information for each iNat project
  iNatNetworks <- lapply(iNatProjNames,getInatNtwks,vpDat=iNatPlDat,erNtwk=ecoRegNetworks) %>% 
    set_names(iNatProjNames)
  
  #Cleanup
  rm(iNatProjNames,useEcoReg,ecoRegStatProvs,ecoRegCountries)
  
  #Write predicted bees at each iNat project to a csv
  if(!is.na(predictedBeesCSV)){
    lapply(iNatNetworks,function(x){
      if(!'matrix' %in% class(x$ntwk_noWeed)){
        x <- matrix(1,dimnames = list('NA','NA'))
      } else {
        x <- x$ntwk_noWeed
      }
      data.frame(x) %>% 
        rownames_to_column('PlantSpp') %>% 
        pivot_longer(-PlantSpp,names_to = 'BeeSpp',
                     names_transform = ~gsub('.',' ',.x,fixed = TRUE)) %>% 
        filter(value>0) %>% select(-value) }) %>% 
      bind_rows(.id='iNatProject') %>% 
      mutate(across(everything(),~ifelse(grepl('NA\\s?',.x),NA,.x))) %>% 
      write.csv(predictedBeesCSV,row.names = FALSE)  
  }
  
  # Create reports --------------------
  print(paste0('Creating reports (',length(iNatNetworks),' total)'))

  for(vy in 1:length(names(iNatNetworks))){
    
    #Dimensions of ecoregion network
    ntwkSize <- dim(ecoRegNetworks[[unique(iNatPlDat$ecoreg[
      iNatPlDat$vineyard==names(iNatNetworks)[vy]])]]$ntwk_all)
    
    #Check that network size is large enough
    if(prod(ntwkSize)<500){ #If total interaction space isn't large
      print(paste0('Ecoregion network size (',unique(iNatPlDat$ecoreg[iNatPlDat$vineyard==names(iNatNetworks)[vy]]),' = ',
                 
        ntwkSize[1],' plants, ',ntwkSize[2],' pollinators) is too small to produce useful information for project (',
        names(iNatNetworks)[vy],
        ')'))
    } else {
      
      #Path to Rmd template
      rmdPath <- system.file('rmdTemplates','ecoregion-report-template.Rmd',package=packageName(),mustWork = TRUE)
    
      suppressWarnings({
        render(rmdPath,
               # output_file = paste0(names(iNatNetworks)[vy],'-report'),
               output_file = 'report',
               output_format = "pdf_document",
               output_dir = reportFolder,
               # intermediates_dir = reportFolder, #Doesn't produce maps correctly if specified
               knit_root_dir = reportFolder,
               params = list(set_title=names(iNatNetworks)[vy]),
               envir=new.env(),
               quiet = TRUE
        )  
      }); beepr::beep(1)
      
      #Cleanup
      cln <- file.remove(list.files(dirname(rmdPath),'.*(pdf|log)',full.names = TRUE))
      if(!any(!cln)) warning('Accessory files not removed. Manual cleanup needed afterwards.')
      message(paste0('Finished report ',names(iNatNetworks)[vy]))
    }
    
  }
  print('Done')
  
  #Save data to Rdata file 
  if(!is.na(dataStoragePath)){
    save(beeData,ecoRegNetworks,plantList,iNatPlDat,vyCombos,vyCombos2,iNatNetworks,file = dataStoragePath)
  }
}

