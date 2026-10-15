#' @title Clean plant and bee data
#' @description Clean plant and bee data for use in stewardship reports
#' 
#' @param plantListCSV _Required_ - CSV of plant species 
#' @param beeDataCSV _Required_ - CSV of bee/plant interactions from OBA.
#' @param beeDataColumns _Required_ - named character vector with column names from _beeDataCSV_ to use.
#' @param iNatFolder _Required_ - Folder/subfolders containing vineyard iNaturalist CSV files.
#' @param plDatCSV (Optional) output csv of all plant records. Skips writing if NA.
#' @param missingPlDatCSV (Optional) output csv of missing plant records. Skips writing if NA.

#' 
#' @return List - writes to plDatCSV, missingPlDatCSV
#' @export
#' 
#' @details 
#' _beeDataColumns_ must have the following column names (see examples):
#' _CollectorName, Sex, ForagePlant, Method, Month, Day, Year, County,_ 
#' _ Genus, Species, Latitude, Longitude_
#'
#' @examples 
#' 
cleanReportData <- function(plantListCSV = NA,
                        beeDataCSV = NA, 
                        beeDataColumns = NA,
                        iNatFolder = NA,
                        plDatCSV = NA,
                        missingPlDatCSV = NA
                        # famGenPath = NA, 
                        # ecoregShpPath = NA, 
                        # stateProvShpPath = NA
){
  
  #Required libraries
  library(dplyr)
  library(tidyr)
  library(stringr)
  library(rlang)
  library(tibble)
  library(knitr)
  library(sf)
  
  #Convenience function
  rmBadChar <- function(x) gsub("[^a-zA-Z0-9:'-.]",' ',x,perl = TRUE) #Gets rid of nonstandard characters that screw up LaTeX reports - leaves dashes, colons, apostrophes, periods
  
  #BS checking
  
  #Mandatory input
  chkInputs <- sapply(c(plantListCSV,beeDataCSV),function(x) !is.na(x)&file.exists(x))
  if(any(!chkInputs)){
    stop(paste0('Input ', paste0(c('plantListCSV','beeDataCSV')[!chkInputs],collapse=', '),' must be specified correctly. Check that path is specified and files exist'))
  } 
  
  chkInputs <- sapply(c(iNatFolder),function(x) !is.na(x)&dir.exists(x))
  if(any(!chkInputs)){
    stop(paste0('Input ', paste0(c('iNatFolder')[!chkInputs],collapse=', '),' must be specified correctly. Check that path is specified and directory exists.'))
  } 
  
  #Required column names
  reqBNames <- c("CollectorName","Sex","ForagePlant","Method","Month","Day","Year",
                 "County","Genus","Species","Latitude","Longitude")
  
  if(any(any(is.na(beeDataColumns))|length(beeDataColumns)!=length(reqBNames)|any(!names(beeDataColumns) %in% reqBNames))){
    stop(paste0('beeDataColumns must be a named character vector with the following names:\n',
                paste0(reqBNames,collapse=', ')))
  }
  
  #Optional input
  # chkInputs <- sapply(c(famGenPath),function(x) is.na(x)||file.exists(x))
  # if(any(!chkInputs)){
  #   stop(paste0('Input ', paste0(c('famGenPath')[!chkInputs],collapse=', '),' must be specified correctly. Check that path is specified and files exist'))
  # }
  
  #Get paths to iNaturalist csvs
  csvPaths <- list.files(iNatFolder,full.names = TRUE, recursive = TRUE,pattern = '.csv') #Gets list of csvs in "./data" folder
  
  #Bee family-genus lookup
  # famGen <- read.csv(ifelse(is.na(famGenPath),system.file('extdata','famGenLookup.csv',package=packageName(),mustWork = TRUE),famGenPath)) %>%
  famGen <- read.csv(system.file('extdata','famGenLookup.csv',package=packageName(),mustWork = TRUE)) %>% 
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
    message(paste0("Plant names with 'var' or 'ssp' found in plant list. Excluded ",sum(chooseThese)," from plant list:\n",
                   paste(plantList$Scientific_name[chooseThese],collapse = '\n'),'\n'))
    plantList <- plantList %>% filter(!chooseThese)  
  }
  
  #Gets rid of family or higher level taxonomy records
  chooseThese <- grepl('^\\S+(ales|eae|dae|nae)$',plantList$Scientific_name)
  if(any(chooseThese)){
    message(paste0("Orders, families, or other non-genus groups found in plant list. Excluded ",sum(chooseThese)," from plant list:\n",
                   paste(plantList$Scientific_name[chooseThese],collapse = '\n'),'\n'))
    plantList <- plantList %>% filter(!chooseThese)  
  }
  
  #Gets rid of triple names
  # Could fix by removing the end of triple-names (varieties), but leads to problems with duplicate plant names - let the user figure this out
  chooseThese <- grepl('\\s.*\\s.*$',plantList$Scientific_name)
  if(any(chooseThese)){
    message(paste0("Triple names (possibly varieties or culivars) found in plant list. Excluded ",sum(chooseThese)," from plant list:\n",
                   paste(plantList$Scientific_name[chooseThese],collapse = '\n'),'\n'))
    plantList <- plantList %>% filter(!chooseThese) 
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
    #Adds columns of plant traits 
    rename(isNoxious=Noxious_weed,isWeedy=Weedy_species) |> 
    mutate(isNative=grepl('(N|n)ative',Origin,)) %>% 
    mutate(isWeedy=ifelse(isNoxious,FALSE,isWeedy)) %>% #Removes noxious species from weedy (non-overlapping sets)
    mutate(isLandscape=grepl('landscape',Garden_type),isEdge=grepl('edge areas',Garden_type),
           isRiparian=grepl('riparian',Garden_type),isOpen=grepl('open areas',Garden_type),
           isOakWoodland=grepl('oak woodland',Garden_type),isWetland=grepl('seasonally wet',Garden_type)) |> #Assigns garden type - clunky, but works
    arrange(Scientific_name) #Sorts by name
  
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
  
  # Load and clean up bee data ------------------------------------
  print('Loading regional bee data - takes some time')
  beeData <- read.csv(beeDataCSV,stringsAsFactors = FALSE,
                      strip.white = TRUE,na.strings=c('NA',''))
  print('Cleaning regional bee data')
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
    beeData <- beeData %>% mutate(ForagePlant=gsub('\\s\\(.+$','',ForagePlant)) 
  }
  
  chooseThese <- grepl('(\\s.\\s.*$|\\s.$)',beeData$ForagePlant)#Gets rid of hybrid x marks
  if(any(chooseThese)){
    message(paste0("Hybrid names, x marks, or other non-standard text found in ForagePlant names in bee list. Altered ",sum(chooseThese)," records from bee list\n",
                   paste(apply(cbind(unique(na.omit(beeData$ForagePlant[chooseThese])),
                                     paste(gsub('(\\s.\\s.*$|\\s.$)','',unique(na.omit(beeData$ForagePlant[chooseThese]))))),1,
                               paste,collapse=' -> '),collapse='\n'),'\n'))
    beeData <- beeData %>% mutate(ForagePlant=gsub('(\\s.\\s.*$|\\s.$)','',ForagePlant)) #Replace text 
  }
  
  chooseThese <- grepl('(^\\S+(ales|eae|dae|nae)$|Composite)',beeData$ForagePlant) #Gets rid of higher-level names
  if(any(chooseThese)){
    message(paste0("Orders, families, or other non-genus groups found in ForagePlant names in bee list. Removed ",sum(chooseThese)," records from bee list\n",
                   paste(unique(na.omit(beeData$ForagePlant[chooseThese])),collapse='\n'),'\n'))
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

  
  #Check whether species in bee data are found in plant database
  foragePlantMissing <- sort(unique(beeData$ForagePlant[!beeData$ForagePlant %in% plantList$Scientific_name]))
  
  if(length(foragePlantMissing)>0){
    message(paste0(length(foragePlantMissing), " forage plant species in bee database were not found in plant list:\n\n",
                   paste(foragePlantMissing,collapse = '\n'),'\n'))
    
  }
  
  # Load ecoregion/state province polygons ------------------------
  print('Loading ecoregion/state/province polygons')
  
  #Shapefiles of North American ecoregions
  
  #Gets path from internal data
  ecoReg <- st_read(
    # ifelse(is.na(ecoregShpPath),system.file('shapefiles','NA_ecoregions.gpkg',package=packageName(),mustWork = TRUE),ecoregShpPath),
    system.file('shapefiles','NA_ecoregions.gpkg',package=packageName(),mustWork = TRUE),
    quiet = TRUE) %>% rename(geometry=geom)
  
  if(any(!c('EcoRegName','ProvStateName','CountryName','geometry') %in% colnames(ecoReg))){
    stop(paste0('Ecoregion shapefiles must have the following columns:\n',paste0(c('EcoRegName','ProvStateName','CountryName','geometry'),collapse='\n')))
  }
  
  ecoReg <- ecoReg %>% rename(name=EcoRegName) %>% #Read in ecoregion polygons
    st_transform(3643) %>% #Transform to Oregon Lambert
    group_by(name) %>% summarize(across(-geometry,first),geometry=st_union(geometry)) %>% ungroup() %>% #Join (union) separate polygons
    mutate(name=gsub(' and ',' & ',name)) #Replace "and" with "&"

  beeData$ecoreg <- gsub('\n',' ',ecoReg$name)[st_within_fast(beeData,ecoReg)] #Get rid of carriage return in ecoregion name
    
  if(any(is.na(beeData$ecoreg))){
    message(paste0(sum(is.na(beeData$ecoreg)),' bee samples not within ecoregion polygons discarded\n'))
    beeData <- beeData %>% filter(!is.na(ecoreg))
  }
  
  #Test for repeated spaces
  if(any(apply(st_drop_geometry(beeData),2,function(x) any(grepl('  ',sort(unique(x))))))){
    stop('Double spaces "  " found in bee data')
    apply(st_drop_geometry(beeData),2,function(x) any(grepl('  ',sort(unique(x)))))
  }
  
  mi2km <- 1.609344 #Miles per kilometer
  
  #Load state/province polygons
  stateProvs <- st_read(
    # ifelse(is.na(stateProvShpPath),system.file('shapefiles','NA_statesProvs.gpkg',package=packageName(),mustWork = TRUE),stateProvShpPath),
    system.file('shapefiles','NA_statesProvs.gpkg',package=packageName(),mustWork = TRUE),
    quiet = TRUE) %>% rename(geometry=geom)
  
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
    iNatPlDat <- iNatPlDat %>% filter(!is.na(ecoreg))
  }
  
  #Join state/province/country data onto iNat plant dat
  iNatPlDat$stateProv <- stateProvs$NAME_En[st_within_fast(st_transform(iNatPlDat,st_crs(stateProvs)),stateProvs)]
  iNatPlDat$country <- stateProvs$COUNTRY[st_within_fast(st_transform(iNatPlDat,st_crs(stateProvs)),stateProvs)] 
  
  iNatProjNames <- gsub('.csv','',sort(unique(basename(csvPaths)))) #Names from csv paths
  
  if(any(!iNatProjNames %in% unique(iNatPlDat$vineyard))){ #If there are any vineyards that have been completely filtered out  (empty)
    message(paste0('Some projects were not present after iNat record filtering. Check to make sure the locations of iNat records are within ecoregions, and that they contain plant genus information:\n\n',
                   paste(iNatProjNames[!iNatProjNames %in% unique(iNatPlDat$vineyard)],collapse='\n')))
    
    iNatProjNames <- unique(iNatPlDat$vineyard) #Rewrites iNat plantnames if some are missing
  }
  
  #If path provided - Write all iNat plant records to single csv
  if(!is.na(plDatCSV)){ 
    iNatPlDat %>% st_transform(4269) %>% 
      mutate(lat=st_coordinates(.)[,2],lon=st_coordinates(.)[,1]) %>% 
      st_drop_geometry() %>% 
      write.csv(.,file = plDatCSV,row.names = FALSE)
  }
  
  #If path provided - Write list of missing/present species to csv 
  if(!is.na(missingPlDatCSV)){
    plantDataSummary <- list('inPlantDatabase'=plantList$Scientific_name,
                             'hasBloomStart'=plantList$Scientific_name[grepl('\\w',plantList$Bloom_start)],
                             'hasBloomEnd'=plantList$Scientific_name[grepl('\\w',plantList$Bloom_end)],
                             'hasCommonName'=plantList$Scientific_name[grepl('\\w',plantList$Common_name )],
                             'hasLifecycle'=plantList$Scientific_name[grepl('\\w',plantList$Lifecycle)],
                             'hasOrigin'=plantList$Scientific_name[grepl('\\w',plantList$Origin)],
                             'hasWeedyStatus'=plantList$Scientific_name[!is.na(plantList$isWeedy)],
                             'hasNoxiousStatus'=plantList$Scientific_name[!is.na(plantList$isNoxious)],
                             'inBeeForagePlants'=sort(unique(beeData$ForagePlant)),
                             'inINatPlants'=sort(unique(iNatPlDat$scientific_name))
    ) %>% lapply(.,function(x) data.frame('PlantSpp'=x)) %>% bind_rows(.id = 'dataset') %>% 
      mutate(valCol=TRUE) %>% pivot_wider(names_from=dataset,values_from=valCol,values_fill = FALSE) |> 
      arrange(PlantSpp) 
    
    if(sum(apply(plantDataSummary[,-1],1,function(x) any(!x)))>0){
      message(paste0(sum(apply(plantDataSummary[,-1],1,function(x) any(!x))),' plants missing from plant database, bee forage plant records, or iNaturalist records:\n\n'))
      temp <- ftable(xtabs(~inPlantDatabase+inBeeForagePlants+inINatPlants,data = plantDataSummary),row.vars = 1:3) #Contingency table
      attr(temp,'col.vars') <- 'Number of Plants' #Renames column
      print(temp)
      message(paste0('Writing plant data summary csv to:\n\n ',missingPlDatCSV))
      write.csv(arrange(plantDataSummary,grepl('spp.',PlantSpp),PlantSpp), missingPlDatCSV,row.names = FALSE)
    }
  }
  
  retList <- list('plantList'=plantList,'beeData'=beeData,'iNatPlDat'=iNatPlDat,
                  'ecoReg'=ecoReg,'iNatProjNames'=iNatProjNames,'famGen'=famGen)
  return(retList)
  
}