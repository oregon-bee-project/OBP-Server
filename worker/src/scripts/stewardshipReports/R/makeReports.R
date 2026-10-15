#' @title Make vineyard reports
#' @description Create vineyard reports from iNaturalist project data, bee/plant interactions, and plant list.
#' 
#' @param plantListCSV _Required_ - CSV of plants from Oregon Flora.
#' @param beeDataCSV _Required_ - CSV of bee/plant interactions from OBA.
#' @param beeDataColumns _Required_ - named character vector with column names from _beeDataCSV_ to use.
#' @param iNatFolder _Required_ - Folder/subfolders containing vineyard iNaturalist CSV files.
#' @param reportFolder _Required_ - Folder for writing reports to.
#' @param vinePlDatCSV (Optional) output csv of all vineyard records. Skips writing if NA.
#' @param predictedBeesCSV (Optional) output csv of predicted bees for each vineyard. Skips writing if NA.
#' @param dataStoragePath (Optional) .Rdata storage path for internal function data. Skips writing if NA.
#' @param famGenPath (Optional) Path to bee genus-family lookup csv. If NA uses lookup table from Pizkulich et al 2023 (DOI: 10.5061/dryad.80gb5mkw1).
#' @param orCountyShpPath (Optional) Path to Oregon county polygons. Uses internal if NA.
#' @param orEcoregShpPath (Optional) Path to Oregon ecoregion polygons. Uses internal if NA.
#' @param beeAbstractsPath (Optional) Path to bee/plant Abstract csv.
#' 
#' @return Nothing - writes to vinePlDatCSV, predictedBeesCSV, or dataStoragePath
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
#' makeReports(plantListCSV = './cleanedPlantList2024.csv',
#'   beeDataCSV = './OBA_2017_2023_v16Oct24.csv',
#'   beeDataColumns = bNames, 
#'   iNatFolder =  './iNat records',
#'   reportFolder = './reports',
#'   vinePlDatCSV = NA, predictedBeesCSV = NA, dataStoragePath = NA)
#' 
makeReports <- function(plantListCSV = NA, 
                        beeDataCSV = NA, 
                        beeDataColumns = NA,
                        iNatFolder = NA,
                        reportFolder = NA,
                        vinePlDatCSV = NA,
                        predictedBeesCSV = NA,
                        dataStoragePath = NA,
                        famGenPath = NA,
                        orCountyShpPath = NA, 
                        orEcoregShpPath = NA,
                        beeAbstractsPath = NA
){
  
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
  chkInputs <- sapply(c(famGenPath,orCountyShpPath,orEcoregShpPath,beeAbstractsPath),function(x) is.na(x)||file.exists(x))
  if(any(!chkInputs)){
    stop(paste0('Input ', paste0(c('famGenPath','orCountyShpPath','orEcoregShpPath','beeAbstractsPath')[!chkInputs],collapse=', '),' must be specified correctly. Check that path is specified and files exist'))
  }
  
  #Get paths to vineyard iNaturalist csvs
  csvPaths <- list.files(iNatFolder,full.names = TRUE, recursive = TRUE,pattern = '.csv') #Gets list of csvs in "./data" folder
  
  #Bee family-genus lookup
  famGen <- read.csv(ifelse(is.na(famGenPath),system.file('extdata','famGenLookup.csv',package=packageName(),mustWork = TRUE),famGenPath)) %>% 
    select(Family,Genus) %>% #Cut out Tribe/Subfamilies
    rename(lookupFam=Family) #Bee genus-family lookup table
  
  # Load and clean up Oregon plant data -------------------------
  print('Loading regional plant data')
  plantList <- read.csv(plantListCSV,strip.white = TRUE,encoding = 'UTF-8') 
  
  reqPlantCols <- c('Scientific_name','Synonym','Common_name','Bloom_start',
                    'Bloom_end','Lifecycle','Origin','Garden_type','Family','PlantAbstract')
  
  #Checks columns
  if(any(!reqPlantCols %in% colnames(plantList))){
    stop(paste0('Plant list from Oregon Flora must have the following columns:\n',paste0(reqPlantCols,collapse='\n')))
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
  
  #Adds genera to list if not already present
  plGen <- unique(gsub('\\s.*','',plantList$Scientific_name)) #Unique plant genera
  noGen <- plGen[!plGen %in% gsub('\\s.*','',plantList$Scientific_name[grepl('.spp',plantList$Scientific_name)])] #Listed plant species with no generic-level (X spp.) record
  if(length(noGen)>0){
    message(paste0('Genus-level information for ',length(noGen),' listed plant species missing. Adding missing genera:',
                   paste(c('\n',noGen),collapse = '\n'),'\n'))
    Sys.sleep(1)
    cstring <- function(x) paste0(unique(unlist(strsplit(x,', '))),collapse=', ')
    
    #Gets plants that don't have a genus-level record, and amalgamates lifecycle, origin, and garden info
    plantList <- plantList %>% select(Scientific_name,Lifecycle,Origin:Garden_type,Family) %>% 
      mutate(Scientific_name=gsub('\\s.*','',Scientific_name)) %>% 
      filter(Scientific_name %in% noGen) %>% mutate(Scientific_name=paste0(Scientific_name,' spp.')) %>% 
      group_by(Scientific_name) %>% summarize(across(c(Lifecycle,Origin,Garden_type),cstring),
                                              across(c(isNoxious,isWeedy),~any(!.x))) %>% 
      bind_rows(plantList) #Adds to the original plant list  
  }
   
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
  nonNativeGen <- plantList %>% select(Scientific_name,isNative) %>%
    mutate(Scientific_name=gsub('\\s.*$','',Scientific_name)) %>% group_by(Scientific_name) %>%
    summarize(anyNative=any(isNative)) %>% filter(!anyNative) %>% pull(Scientific_name)
  
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
    mutate(Genus=str_to_title(Genus)) %>%  #Capitalize spp names
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
    beeData <- beeData %>% mutate(ForagePlant=gsub('(\\s.\\s.*$|\\s.$)','',ForagePlant)) 
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
  
  # Load spatial data ------------------------
  print('Loading county/ecoregion polygons')
  #Shapefiles of Oregon counties
  
  #Gets path from internal data if NA
  orCountyShpPath <- ifelse(is.na(orCountyShpPath),system.file('shapefiles','orcntypoly.shp',package=packageName(),mustWork = TRUE),orCountyShpPath)
  orCounties <- st_read(orCountyShpPath,quiet = TRUE) #Read in county polygons
  
  if(any(!c('altName','geometry') %in% colnames(orCounties))){
    stop(paste0('Oregon county shapefiles must have the following columns:\n',paste0('altName',collapse='\n')))
  }
  
  orCounties <- orCounties %>% select(altName) %>% #st_set_crs(4269) %>% #NAD83
    st_transform(3643)
  
  #Shapefiles of Oregon ecoregions
  
  #Gets path from internal data if NA
  orEcoregShpPath <- ifelse(is.na(orEcoregShpPath),system.file('shapefiles','or_eco_l3.shp',package=packageName(),mustWork = TRUE),orEcoregShpPath)
  orEcoReg <- st_read(orEcoregShpPath,quiet = TRUE)
  
  if(any(!c('NA_L3NAME','geometry') %in% colnames(orEcoReg))){
    stop(paste0('Oregon ecoregion shapefiles must have the following columns:\n',paste0('NA_L3NAME',collapse='\n')))
  }
  
  orEcoReg <- orEcoReg %>% transmute(name=NA_L3NAME) %>% #Read in ecoregions
    st_transform(3643) %>% #Transform to Oregon Lambert
    mutate(name=gsub(' and ',' & ',name)) %>% #Replace "and" with "&"
    mutate(name=gsub('Cascades Slopes','Cascades\nSlopes',name)) #Add line break (\n) to "Cascades Slopes"
  
  #Overwrite county name using shapefiles, using lat/lon data from individual records
  
  #Get county index for each location
  beeData$county <- orCounties$altName[st_within_fast(beeData,orCounties)] #Overwrite county
  if(any(is.na(beeData$county))){
    message(paste0(sum(is.na(beeData$county)),' bee samples not within Oregon counties discarded\n'))
    Sys.sleep(1)
    beeData <- beeData %>% filter(!is.na(county))
  }
  
  #Get Oregon ecoregion
  beeData$ecoreg <- gsub('\n',' ',orEcoReg$name)[st_within_fast(beeData,orEcoReg)] #Get rid of carriage return in ecoregion name
  if(any(is.na(beeData$ecoreg))){
    message(paste0(sum(is.na(beeData$ecoreg)),' bee samples not within Oregon ecoregions discarded\n'))
    Sys.sleep(1)
    beeData <- beeData %>% filter(!is.na(ecoreg))
  }
  
  #Test for repeated spaces
  if(any(apply(st_drop_geometry(beeData),2,function(x) any(grepl('  ',sort(unique(x))))))){
    stop('Double spaces "  " found in bee data')
    apply(st_drop_geometry(beeData),2,function(x) any(grepl('  ',sort(unique(x)))))
  }
  
  mi2km <- 1.609344 #Miles per kilometer
  
  #Common names for bee families
  commonFam <- data.frame(Family=factor(c('Andrenidae','Apidae','Colletidae','Halictidae','Megachilidae')),
                          common=c('Mining bees','Social bees','Polyester bees','Sweat bees','Leaf-cutting bees')) %>%
    mutate(plotLab=paste0(Family,'\n(',common,')'))
  
  #Load and clean up iNaturalist records ------------------------
  print('Loading iNaturalist records')
  #Function to get CSV files
  getCSVs <- function(x){ 
    l <- read.csv(x,strip.white = TRUE) #Read in csvs
    reqCols <- c('latitude','longitude','scientific_name','common_name','observed_on') #Required columns names
    if(any(!reqCols %in% colnames(l))){ #If observed_on not found in iNat record
      stop(paste0('Columns missing from iNaturalist record: ',x,'. Required columns: ',paste0(reqCols,collapse = ', ')))
    }
    l <- l %>% select(reqCols) %>% #Select relevant columns
      mutate(vineyard=gsub('(^.+\\d{4}/|\\.csv$)','',x)) #Gets vineyard name
    return(l)
  }
  
  #Get all CSVs and assemble into single dataframe
  vinePlDat <- lapply(csvPaths,getCSVs) %>% 
    bind_rows() %>% tibble() %>% 
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
  badDates <- is.na(vinePlDat$year) | as.numeric(vinePlDat$year)<2010
  if(any(badDates)){
    stop(paste0('Date format not recognized in the following iNat projects:\n',
                vinePlDat %>% st_drop_geometry() %>% filter(badDates) %>% pull(vineyard) %>% unique() %>% paste0(.,collapse=','),
                '\nobserved_on column must be in YYYY-MM-DD format'))
  }
  
  #Join ecoregions and counties to vineyard data
  vinePlDat$ecoreg <- gsub('\n',' ',orEcoReg$name)[st_within_fast(vinePlDat,orEcoReg)] #Get rid of carriage return in ecoregion name
  if(any(is.na(vinePlDat$ecoreg))){
    message(paste0(sum(is.na(vinePlDat$ecoreg)),' samples not matching Oregon ecoregions discarded\n'))
    Sys.sleep(1)
    vinePlDat <- vinePlDat %>% filter(!is.na(ecoreg))
  }
  
  vyNames <- gsub('.csv','',sort(unique(basename(csvPaths)))) #Unique vineyard names from csv paths
  
  if(any(!vyNames %in% unique(vinePlDat$vineyard))){ #If there are any vineyards that have been completely filtered out 
    message(paste0('Some vineyards were not present after iNat record filtering. Check to make sure the locations of iNat records are within Oregon counties/ecoregions, and that they contain plant genus information:\n\n',
                   paste(vyNames[!vyNames %in% unique(vinePlDat$vineyard)],collapse='\n')))
    Sys.sleep(1)
    vyNames <- unique(vinePlDat$vineyard) #Rewrites vineyard names if some are missing
  }
  
  if(!is.na(vinePlDatCSV)){ #If path provided
    #Write all iNat records to single csv
    vinePlDat %>% st_transform(4269) %>% 
      mutate(lat=st_coordinates(.)[,2],lon=st_coordinates(.)[,1]) %>% 
      st_drop_geometry() %>% 
      write.csv(.,file = vinePlDatCSV,row.names = FALSE)
  }
  
  # Make regional and vineyard-level networks ------------------------------------
  print('Creating networks')
  # Gets unique plant records and associated bee records from the 2024 bee data. Used to generate a list of "highlight" bees and plants for growers
  
  #Create ecoregions-specific networks (all interactions from a given region). Should eventually turn into a stand-alone function. Could also make a general-purpose version that works with arbitrary subsets (would replace both getRegNtwks and getVyNtwks?)
  getRegNtwks <- function(nm,bdat,pList){ 
    if(nm=='ALL'){ #Uses all of Oregon
      d <- bdat %>% st_drop_geometry()
    } else {
      d <- bdat %>% filter(ecoreg==nm) %>% st_drop_geometry() #Filters data to ecoregion. Could use some kind of tidyr nested dataframe approach
    }
    
    #dataframe: Bee spp -> flower spp
    sppList <- d %>% filter(!is.na(Species),!is.na(plantSpp)) %>%
      select(genSpp,ForagePlant) %>% na.omit() %>%
      group_by(ForagePlant) %>%
      summarize(beeSpp=paste0(genSpp,collapse = ','))
    
    #dataframe: Bee spp -> plant genera (plant spp unknown)
    genList <- d %>% filter(!is.na(Species)) %>%
      select(genSpp,plantGenus) %>% na.omit() %>%
      group_by(plantGenus) %>%
      summarize(beeSpp=paste0(unique(genSpp),collapse = ',')) %>%
      rename(ForagePlant=plantGenus)
    
    #matrix: Bee spp -> plant spp (all)
    ntwk_all <- d %>% filter(!is.na(Species),!is.na(plantSpp)) %>%
      select(genSpp,ForagePlant) %>% na.omit() %>%
      left_join(select(pList,Scientific_name,isWeedy,isNoxious,isNative),
                by = c('ForagePlant'='Scientific_name')) %>%
      count(genSpp,ForagePlant) %>%
      pivot_wider(names_from=ForagePlant,values_from=n,values_fill = 0) %>%
      column_to_rownames('genSpp') %>% as.matrix() %>% t()
    
    #matrix: Bee spp -> plant spp (nonweedy natives only)  - recommended plant spp for growers
    ntwk_noWeed <- d %>% filter(!is.na(Species),!is.na(plantSpp)) %>%
      select(genSpp,ForagePlant) %>% na.omit() %>%
      left_join(select(pList,Scientific_name,isWeedy,isNoxious,isNative),
                by = c('ForagePlant'='Scientific_name')) %>%
      filter(!is.na(isWeedy),!isNoxious,!isWeedy,isNative) %>%
      count(genSpp,ForagePlant) %>%
      pivot_wider(names_from=ForagePlant,values_from=n,values_fill = 0) %>%
      column_to_rownames('genSpp') %>% as.matrix() %>% t()
    
    #matrix: Bee genus -> plant genus (all)
    ntwk_gen_all <- d %>% select(Genus,plantGenus) %>% na.omit() %>% 
      count(Genus,plantGenus) %>%
      pivot_wider(names_from=plantGenus,values_from=n,values_fill = 0) %>%
      column_to_rownames('Genus') %>% as.matrix() %>% t()
    
    #matrix: Bee Species -> plant genus (all) 
    ntwk_genSpp_all <- d %>% filter(!is.na(Species)) %>%
      select(genSpp,plantGenus) %>% na.omit() %>%
      count(genSpp,plantGenus) %>%
      pivot_wider(names_from=plantGenus,values_from=n,values_fill = 0) %>%
      column_to_rownames('genSpp') %>% as.matrix() %>% t()
    
    #Temporary plant list with only genus-level info
    plantList2 <- pList %>% select(Scientific_name,isWeedy,isNoxious,isNative) %>% 
      mutate(Genus_name=gsub('\\s.*$','',Scientific_name)) %>% 
      group_by(Genus_name) %>% 
      #"Abraham's bargain": is there at least 1 nonweedy, nonnoxious, and native Species?
      summarize(isNonWeedy=any(!isWeedy),isNonNoxious=any(!isNoxious),isNative=any(isNative))
    
    #matrix: Bee Species -> plant genus (all) - Recommended plant Species for growers
    ntwk_genSpp_noWeed <- d %>% filter(!is.na(Species)) %>%
      select(genSpp,plantGenus) %>% na.omit() %>%
      left_join(plantList2,by = c('plantGenus'='Genus_name')) %>%
      filter(!is.na(isNonWeedy),isNonNoxious,isNonWeedy,isNative) %>%
      count(genSpp,plantGenus) %>%
      pivot_wider(names_from=plantGenus,values_from=n,values_fill = 0) %>%
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
      #Top plant species for ecoregion (based on Chao1 richness from plant spp - bee spp network)
      topSpp <- vegan::estimateR(ntwk_all) %>% t() %>% 
        data.frame() %>% 
        rownames_to_column('plantSpp') %>%
        select(plantSpp:S.chao1) %>% arrange(desc(S.chao1)) %>% 
        rename(Nbees=S.obs,Nbees_estim=S.chao1) %>%
        mutate(Nbees_rare=rowSums(ntwk_all[,colnames(ntwk_all) %in% rareBees$genSpp,drop=FALSE])) %>%
        arrange(desc(Nbees)) %>%
        #Creates plant "quality" rankings, based on number of rare bees hosted (>0) and overall visitor richness (>median)
        mutate(quality=case_when( #Cutoffs for forage plant "quality"
          Nbees_estim >median(Nbees_estim) & Nbees_rare >0 ~ 'super',
          xor(Nbees_estim > median(Nbees_estim),Nbees_rare >0) ~ 'good',
          TRUE ~ 'poor')) %>% 
        mutate(quality=factor(quality,levels=c('super','good','poor')))
    }
    
    if(any(dim(ntwk_genSpp_noWeed)==0)){
      if(any(dim(ntwk_genSpp_all)==0)){
        message('No plant genus data found for ',nm,'\n')
      } else{
        message('No non-weedy plant genus data for ',nm,'\n')  
      }
      Sys.sleep(1)
      topGen <- NA
    } else {
      #Top plant genera (Chao1 richness from plant genus - bee spp network)
      topGen <- vegan::estimateR(ntwk_genSpp_all) %>% t() %>% 
        data.frame() %>% 
        rownames_to_column('plantGen') %>%
        select(plantGen:S.chao1) %>% arrange(desc(S.chao1)) %>% 
        rename(Nbees=S.obs,Nbees_estim=S.chao1) %>%
        mutate(Nbees_rare=rowSums(ntwk_genSpp_all[,colnames(ntwk_genSpp_all) %in% rareBees$genSpp,drop=FALSE])) %>%
        arrange(desc(Nbees)) %>%
        #Creates plant "quality" rankings, based on number of rare bees hosted (>0) and overall visitor richness (>median)
        mutate(quality=case_when( #Cutoffs for forage plant "quality"
          Nbees_estim >median(Nbees_estim) & Nbees_rare >0 ~ 'super',
          xor(Nbees_estim > median(Nbees_estim),Nbees_rare >0) ~ 'good',
          TRUE ~ 'poor')) %>% 
        mutate(quality=factor(quality,levels=c('super','good','poor')))
    }
    
    #Output list
    return(list('sppList'=sppList,'genList'=genList,
                'ntwk_all'=ntwk_all,'ntwk_noWeed'=ntwk_noWeed,
                'ntwk_gen_all'=ntwk_gen_all,'ntwk_genSpp_all'=ntwk_genSpp_all,
                'topSpp'=topSpp,'topGen'=topGen,'rareBees'=rareBees))
  }
  
  #Assemble regional networks into a list
  ecoRegNetworks <- lapply(c(orEcoReg$name,'ALL'),getRegNtwks,bdat=beeData,pList=plantList) %>% 
    set_names(c(orEcoReg$name,'ALL'))
  
  #Get unique interaction matrices for each unique vineyard
  
  
  #Get networks for individual vineyards from regional data
  getVyNtwks <- function(vy,vpDat,erNtwk){ #Check variable scoping...
    vyPlantSpp <- vpDat %>% st_drop_geometry() %>% 
      filter(vineyard==vy) %>% #Plant species list for this vineyard
      distinct() %>% filter(scientific_name!=plGenus) %>% 
      pull(scientific_name)
    vyPlantGen <- unique(gsub('\\s.+$','',vyPlantSpp)) #Plant genus list for this vineyard
    vyEcoreg <- unique(vpDat$ecoreg[vpDat$vineyard==vy]) #Ecoregion for this vineyard
    if(length(vyEcoreg)!=1) stop('More than 1 ecoregion per vineyard')
    #Ecoregion network
    ecoregNtwk_summary <- c('ecoRegName'=vyEcoreg,
                            lapply(list('ntwk_all'=erNtwk[[vyEcoreg]]$ntwk_all,
                                        'ntwk_noWeed'=erNtwk[[vyEcoreg]]$ntwk_noWeed),function(x){
                              c('Nsamples'=sum(x),'Nrichness'=sum(x>0),
                                'Nplants'=nrow(x),'Nbees'=ncol(x))  
                            })) 
    #Lists of species and genus (subset of regional lists)
    m <- list(
      #List of plant species along with associated bee species
      'sppList'= filter(erNtwk[[vyEcoreg]]$sppList,ForagePlant %in% vyPlantSpp),
      #List of plant genera along with associated bee species
      'genList'= filter(erNtwk[[vyEcoreg]]$genList,ForagePlant %in% vyPlantGen) 
    )
    
    if(any(nrow(m)==0)){
      message(paste('No plants from',vy,'vineyard found in',vyEcoreg,'plant list\n'))
      Sys.sleep(1)
    }
    
    #Matrices of: full vineyard network + Non-weedy vineyard network
    n <- lapply(list('ntwk'=erNtwk[[vyEcoreg]]$ntwk_all, #Uses ecoregion network
                     'ntwk_noWeed'=erNtwk[[vyEcoreg]]$ntwk_noWeed, #Ecoregion network without weeds
                     'ntwk_all'=erNtwk[['ALL']]$ntwk_all, #Uses full oregon network
                     'ntwk_all_noWeed'=erNtwk[['ALL']]$ntwk_noWeed #Full oregon network without weeds
    ),function(x){
      if(any(rownames(x) %in% vyPlantSpp)){
        x <- x[rownames(x) %in% vyPlantSpp,,drop=FALSE] #Remove plants that aren't found in plant name list
        x <- x[,colSums(x)>0,drop=FALSE] #Remove bees that have no interactions
        return(x)
      } else {
        message(paste('No plants from',vy,'vineyard found in',vyEcoreg,'interaction network\n'))
        return(NA)
      } 
    })
    return(c(list('ecoregNtwk_summary'=ecoregNtwk_summary),m,n))
  }
  
  vyNetworks <- lapply(vyNames,getVyNtwks,vpDat=vinePlDat,erNtwk=ecoRegNetworks) %>% 
    set_names(vyNames)
  
  #Write predicted bees at each vineyard to a csv
  if(!is.na(predictedBeesCSV)){
    lapply(vyNetworks,function(x){
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
      bind_rows(.id='Vineyard') %>% 
      mutate(across(everything(),~ifelse(grepl('NA\\s?',.x),NA,.x))) %>% 
      write.csv(predictedBeesCSV,row.names = FALSE)  
  }
  
  # Highlights list 1 ------------------------------------
  
  #Find unique plant/bee combinations for each vineyard
  
  #Step 1: unique combinations (easy)
  #Step 2: shared combinations (medium)
  #Step 3: no non-weedy native plants (fiddly)
  
  #Simple solution: choose rarer sets of bees/plants first, then descend
  #Vineyards with rarer plants also get rarer bees (?)
  
  #Turns counts into a 3D array - bees, plants, vineyards
  vyCounts <- lapply(vyNetworks,function(x){ #Get list and counts of bee/plant combos 
    x <- x$ntwk_noWeed
    if(!any(class(x)=='matrix')){
      d <- data.frame(bee=NA,plant=NA)
    } else {
      ind <- which(x>0,arr.ind = TRUE)
      d <- data.frame(bee=colnames(x)[ind[,'col']],plant=rownames(x)[ind[,'row']])  
    }
    return(d)
  }) %>% bind_rows(.id = 'vineyard') %>% 
    mutate(across(everything(),factor)) %>% 
    relocate(bee,plant,vineyard) %>% table() %>% 
    as.array()>0
  
  #Reorder array (most-to-least bee richness)
  vyCounts <- vyCounts[order(marginSums(vyCounts,1),decreasing = TRUE),
                       order(marginSums(vyCounts,2),decreasing = TRUE),
                       order(marginSums(vyCounts,3),decreasing = TRUE)]
  
  #Sequential approach - rarest to most common
  
  #Storage dataframe for combinations
  vyCombos <- data.frame('vineyard'=names(vyCounts[1,1,]),
                         'bee'=rep(NA,dim(vyCounts)[3]),'plant'=rep(NA,dim(vyCounts)[3]))
  vyc <- vyCounts[!grepl('Apis',names(vyCounts[,1,1])),,] #Copy of vyCounts (removes honeybees)
  vyCombos[marginSums(vyc,3)==0,c(2,3)] <- 'All weeds' #Vineyards with no non-weedy plants
  vyc <- vyc[marginSums(vyc,1)>0,marginSums(vyc,2)>0,marginSums(vyc,3)>0,drop=FALSE] #Remove empty rows/cols/vineyards
  
  # # Sequential approach by bee - 2 unmatched
  # # Unused at the moment
  # while(any(is.na(vyCombos$bee))){
  #   rBee <- rownames(vyc)[nrow(vyc)] #Rarest bee
  #   loc <- which(vyc[nrow(vyc),,],arr.ind = TRUE) #Array indices of plant/vineyard for last bee
  #   if(is.null(dim(loc))){
  #     loc <- c(loc,1)
  #     } else if(nrow(loc)>1){
  #       loc <- loc[which.max(loc[,2]),] #Chooses last vineyard (lowest diversity)
  #     }
  #   #Write to storage
  #   vyCombos$bee[vyCombos$vineyard==dimnames(vyc)$vineyard[loc[2]]] <- rBee
  #   vyCombos$plant[vyCombos$vineyard==dimnames(vyc)$vineyard[loc[2]]] <- colnames(vyc)[loc[1]]
  #   vyc <- vyc[-nrow(vyc),-loc[1],-loc[2],drop=FALSE] #Remove matched records/vineyards
  #   vyc <- vyc[marginSums(vyc,1)>0,marginSums(vyc,2)>0,marginSums(vyc,3)>0,drop=FALSE] #Remove empty rows/cols/vineyards
  # 
  #   if(length(vyc)==0&any(is.na(vyCombos$bee))){
  #     message(paste0('Ran out of bee/plant combinations. ',sum(is.na(vyCombos$bee)),' unmatched vineyards remain:\n',
  #                    paste(vyCombos$vineyard[is.na(vyCombos$bee)],collapse = '\n')))
  #     break()
  #   }
  # }
  #
  #
  # # "Loneliest partners" first (bee-plant with lowest # of secondary connections) - 3 unmatched
  # while(any(is.na(vyCombos$bee))){
  #   sc <- secConn(apply(vyc,c(1,2),any)) #Matrix of secondary connections
  #   sc <- which(sc==min(sc[sc>=0]),arr.ind = TRUE) #Minimum nonzero secondary connections
  #   sc_min <- which.max(sqrt(sc[,1]^2+sc[,2]^2)) #Chooses furthest distance away (rarest bee/plant)
  # 
  #   loc <- sc[sc_min,] #Array indices of last (rarest) bee/plant
  #   rVy <- which(vyc[loc[1],loc[2],])[max(sum(vyc[loc[1],loc[2],]))] #Gets vineyard (last in list)
  # 
  #     #Write to storage
  #   vyCombos$bee[vyCombos$vineyard==names(rVy)] <- rownames(vyc)[loc[1]] #Rarest bee with fewest connections
  #   vyCombos$plant[vyCombos$vineyard==names(rVy)] <- colnames(vyc)[loc[2]]
  #   vyc <- vyc[-loc[1],-loc[2],-rVy,drop=FALSE] #Remove matched records/vineyards
  #   vyc <- vyc[marginSums(vyc,1)>0,marginSums(vyc,2)>0,marginSums(vyc,3)>0,drop=FALSE] #Remove empty rows/cols/vineyards
  # 
  #   if(length(vyc)==0&any(is.na(vyCombos$bee))){
  #     message(paste0('Ran out of bee/plant combinations. ',sum(is.na(vyCombos$bee)),' unmatched vineyards remain:\n',
  #                    paste(vyCombos$vineyard[is.na(vyCombos$bee)],collapse = '\n')))
  #     break()
  #   }
  # }
  #
  # #Random assignment - can't get better than 3 unmatched
  # {a <- Sys.time()
  # rReps <- replicate(10000,{
  #   #Storage dataframe for combinations
  #   vyCombos <- data.frame('vineyard'=names(vyCounts[1,1,]),
  #                          'bee'=rep(NA,dim(vyCounts)[3]),'plant'=rep(NA,dim(vyCounts)[3]))
  #   vyc <- vyCounts #Copy of vyCounts
  #   
  #   vyCombos[marginSums(vyc,3)==0,c(2,3)] <- 'None' #Vineyards with no non-weedy plants
  #   vyc <- vyc[,,!marginSums(vyc,3)==0]
  #   
  #   while(any(is.na(vyCombos$bee))){
  #     loc <- which(vyc,arr.ind = TRUE)[sample(1:sum(vyc),1),] #Array indices of random bee/plant/vineyard
  #     rVy <- dimnames(vyc)$vineyard[loc[3]] #Vineyard name
  #     
  #     #Write to storage
  #     vyCombos$bee[vyCombos$vineyard==rVy] <- rownames(vyc)[loc[1]] #Rarest bee with fewest connections
  #     vyCombos$plant[vyCombos$vineyard==rVy] <- colnames(vyc)[loc[2]]
  #     vyc <- vyc[-loc[1],-loc[2],-loc[3],drop=FALSE] #Remove matched records/vineyards
  #     vyc <- vyc[marginSums(vyc,1)>0,marginSums(vyc,2)>0,marginSums(vyc,3)>0,drop=FALSE] #Remove empty rows/cols/vineyards
  #     
  #     if(length(vyc)==0) break()
  #   }
  #   
  #   if(length(vyc)==0&any(is.na(vyCombos$bee))){
  #     return(vyCombos$vineyard[is.na(vyCombos$bee)])
  #   } else {
  #     return(vyCombos)
  #   }  
  # })
  # b <- Sys.time()}
  # 
  # table(sapply(rReps,mode))
  # table(sapply(rReps,length))
  
  #Sequential approach by vineyard - works!
  while(any(is.na(vyCombos$bee))){
    
    rVy <- vyCombos$vineyard[is.na(vyCombos$bee)][sum(is.na(vyCombos$bee))] #Vineyard to use (lowest-diversity), otherwise no matches appear
    
    loc <- which(vyc[,,dim(vyc)[3]],arr.ind = TRUE) #Get combos from last (lowest-diversity) vineyard 
    loc <- loc[which.max(apply(loc,1,function(x) sqrt(sum(x^2)))),] #Chooses rarest bee/plant combo
    
    #Write to storage
    vyCombos$bee[vyCombos$vineyard==rVy] <- rownames(vyc)[loc[1]] 
    vyCombos$plant[vyCombos$vineyard==rVy] <- colnames(vyc)[loc[2]]
    vyc <- vyc[-loc[1],-loc[2],!names(vyc[1,1,])==rVy,drop=FALSE] 
    vyc <- vyc[marginSums(vyc,1)>0,marginSums(vyc,2)>0,marginSums(vyc,3)>0,drop=FALSE] #Remove empty rows/cols/vineyards
    
    if(length(vyc)==0&any(is.na(vyCombos$bee))){
      message(paste0('Ran out of bee/plant combinations. ',sum(is.na(vyCombos$bee)),' unmatched vineyards remain:\n',
                     paste(vyCombos$vineyard[is.na(vyCombos$bee)],collapse = '\n'),'\n'))
      break()
    }
  }
  
  # vyCombos #Unique records - "Highlights"
  
  #Join bee and plant abstracts
  beeAbstractsPath <- ifelse(is.na(beeAbstractsPath),system.file('extdata','Bee_Abstracts.csv',package=packageName(),mustWork = TRUE),beeAbstractsPath)
  
  beeAbstracts <- read.csv(beeAbstractsPath) %>% 
    mutate(across(everything(),~trimws(gsub('  ',' ',.x)))) %>% #Get rid of extra whitespace and double spaces
    mutate(across(everything(),~rmBadChar(.x))) #Get rid of remaining nonstandard characters
  
  #Join bee/plant abstracts on to unique bees/plants
  vyCombos <- vyCombos %>% left_join(beeAbstracts,by=c('bee'='Bee_Scientific_Name')) %>% 
    left_join(transmute(plantList,Scientific_name,Plant_Common_Name=Common_name,Plant_Abstract=PlantAbstract),
              by=c('plant'='Scientific_name')) 
  
  # Highlights list 2 ----------------------------------------------
  
  #Chooses bee/plant highlight lists independently (highlighted bees don't need to visit highlighted plants)
  #NOTE: this Highlight List is not used at the moment. Future versions could select between different versions
  
  #Storage dataframe
  vyCombos2 <- data.frame('vineyard'=names(vyCounts[1,1,]),
                          'bee'=rep(NA,dim(vyCounts)[3]),'plant'=rep(NA,dim(vyCounts)[3]))
  vyCombos2[vyCombos2$vineyard %in% names(vyNetworks)[sapply(vyNetworks,function(x) any(is.na(x$ntwk_noWeed)))],
            c('bee','plant')] <- 'All weeds' #Vineyards with no non-weedy plants
  
  #Vineyard/plant matrix
  vyp <- sapply(vyNetworks,function(x) data.frame(plants=rownames(x$ntwk_noWeed)),simplify = FALSE) %>% #Non-weedy plants from each vineyards
    bind_rows(.id='vineyard') %>% table() %>% as.array()>0
  # Reorder matrix
  vyp <- vyp[order(rowSums(vyp),decreasing = FALSE),] #Vineyards, from least spp-rich to least
  vyp <- vyp[,order(colSums(vyp),decreasing = TRUE)] #Plants, from most common to least
  #Vineyard/bee matrix
  vyb <- sapply(vyNetworks,function(x) data.frame(bees=colnames(x$ntwk_noWeed)),simplify = FALSE) %>% #Bees from each vineyards
    bind_rows(.id='vineyard') %>% filter(bees!='Apis mellifera') %>% table() %>% as.array()>0
  # Reorder matrix
  vyb <- vyb[order(rowSums(vyb),decreasing = FALSE),] #Vineyards, from most spp-rich to least
  vyb <- vyb[,order(colSums(vyb),decreasing = TRUE)] #Bees, from least common to most
  
  while(any(is.na(vyCombos2$plant))){
    loc <- which(vyp,arr.ind = TRUE) #Get combos from last (lowest-diversity) vineyard
    loc <- loc[which.max(apply(loc,1,function(x) sqrt(sum(x^2)))),] #Chooses lowest diversity/most common plant combo
    
    vyCombos2[vyCombos2$vineyard==rownames(vyp)[loc[1]],'plant'] <- colnames(vyp)[loc[2]]
    vyp <- vyp[-loc[1],-loc[2],drop=FALSE] #Remove vineyard/plant combo
    vyp <- vyp[rowSums(vyp)>0,colSums(vyp)>0,drop=FALSE] #Cleanup empty plants/vineyards
    
    if(length(vyp)==0&any(is.na(vyCombos2$bee))){
      message(paste0('Ran out of plants. ',sum(is.na(vyCombos2$plant)),' unmatched vineyards remain:\n',
                     paste(vyCombos2$vineyard[is.na(vyCombos2$plant)],collapse = '\n'),'\n'))
      vyCombos2$plant[is.na(vyCombos2$plant)] <- 'No matches'
      break()
    }
  }
  
  while(any(is.na(vyCombos2$bee))){
    loc <- which(vyb,arr.ind = TRUE) #Get combos from last (lowest-diversity) vineyard
    loc <- loc[which.max(apply(loc,1,function(x) sqrt(sum(x^2)))),] #Chooses lowest diversity/most common bee combo
    
    vyCombos2[vyCombos2$vineyard==rownames(vyb)[loc[1]],'bee'] <- colnames(vyb)[loc[2]]
    vyb <- vyb[-loc[1],-loc[2],drop=FALSE] #Remove vineyard/bee combo
    vyb <- vyb[rowSums(vyb)>0,colSums(vyb)>0,drop=FALSE] #Cleanup empty bees/vineyards
    
    if(length(vyb)==0&any(is.na(vyCombos2$bee))){
      message(paste0('Ran out of bees. ',sum(is.na(vyCombos2$bee)),' unmatched vineyards remain:\n',
                     paste(vyCombos2$vineyard[is.na(vyCombos2$bee)],collapse = '\n'),'\n'))
      vyCombos2$bee[is.na(vyCombos2$bee)] <- 'No matches'
      break()
    }
  }
  
  rm(vyc,vyb,vyp,loc,rVy)
  
  #Join bee/plant abstracts on to unique bees/plants
  vyCombos2 <- vyCombos2 %>% left_join(beeAbstracts,by=c('bee'='Bee_Scientific_Name')) %>% 
    left_join(transmute(plantList,Scientific_name,Plant_Common_Name=Common_name,Plant_Abstract=PlantAbstract),
              by=c('plant'='Scientific_name')) 
  # save.image(dataStoragePath)
  
  # Create reports --------------------
  print(paste0('Creating reports (',length(vyNetworks),' total)'))

  for(vy in 1:length(names(vyNetworks))){
    
    #Size of ecoregion network
    ntwkSize <- dim(ecoRegNetworks[[unique(vinePlDat$ecoreg[
      vinePlDat$vineyard==names(vyNetworks)[vy]])]]$ntwk_all)
    
    #Check that network size is large enough
    if(prod(ntwkSize)<500){ #If total interaction space isn't lare
      print(paste0('Ecoregion network (',unique(vinePlDat$ecoreg[
        vinePlDat$vineyard==names(vyNetworks)[vy]]),') size for ',
        names(vyNetworks)[vy],' is too small (',ntwkSize[1],
        ' plants, ',ntwkSize[2],' pollinators)'))
    } else {
      
      #Path to Rmd template
      rmdPath <- system.file('rmdTemplates','vineyard-report-template.Rmd',package=packageName(),mustWork = TRUE)  
    
      suppressWarnings({
        render(rmdPath,
               output_file = paste0(names(vyNetworks)[vy],'-report'),
               output_format = "pdf_document",
               output_dir = reportFolder,
               # intermediates_dir = reportFolder, #Doesn't produce maps correctly if specified
               knit_root_dir = reportFolder,
               params = list(set_title=names(vyNetworks)[vy]),
               envir=new.env(),
               quiet = TRUE
        )  
      })
      
      #Cleanup
      cln <- file.remove(list.files(dirname(rmdPath),'.*(pdf|log)',full.names = TRUE))
      if(!any(!cln)) warning('Accessory files not removed. Manual cleanup needed afterwards.')
      message(paste0('Finished report ',names(vyNetworks)[vy]))
    }
    
  }
  print('Done')
  
  #Save data to Rdata file 
  if(!is.na(dataStoragePath)){
    save(beeData,ecoRegNetworks,plantList,vinePlDat,vyCombos,vyCombos2,vyNetworks,file = dataStoragePath)
  }
}

