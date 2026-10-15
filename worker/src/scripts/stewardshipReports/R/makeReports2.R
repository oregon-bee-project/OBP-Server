#' @title Make ecoregion reports
#' @description Create ecoregion reports from iNaturalist project data, bee/plant interactions, and plant list.
#' 
#' @param plantListCSV _Required_ - CSV of plant species 
#' @param beeDataCSV _Required_ - CSV of bee/plant interactions from OBA.
#' @param beeDataColumns _Required_ - named character vector with column names from _beeDataCSV_ to use.
#' @param iNatFolder _Required_ - Folder/subfolders containing vineyard iNaturalist CSV files.
#' @param reportFolder _Required_ - Folder for writing reports to.
#' @param reportTitles (Optional) - character vector with names to add to reports. Must be the same length as the number of iNat projects being processed. Uses iNat project name if NA.
#' @param plDatCSV (Optional) output csv of all plant records. Skips writing if NA.
#' @param missingPlDatCSV (Optional) output csv of missing plant records. Skips writing if NA.
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
                        reportTitles = NA,
                        plDatCSV = NA,
                        missingPlDatCSV = NA,
                        predictedBeesCSV = NA,
                        dataStoragePath = NA
){
  
  # #Debugging parameters
  # devtools::load_all(".") #Load package
  # plantListCSV = "C:\\Users\\s_robinson\\Ducks Unlimited Canada\\IWWR Team - Documents\\Sustainable Agriculture\\External Collaborative Projects\\OSU Vineyard Project 2024-26\\stewardshipReports2026\\PLANTS_CLEAN_2026-05-08.csv"
  # beeDataCSV = "C:\\Users\\s_robinson\\Ducks Unlimited Canada\\IWWR Team - Documents\\Sustainable Agriculture\\External Collaborative Projects\\OSU Vineyard Project 2024-26\\stewardshipReports2026\\workingOccurrences2026_04_01.csv"
  # beeDataColumns = c("CollectorName" = "recordedBy", "Sex" = "sex", "ForagePlant" = "speciesPlant",
  #                    "Method" = "samplingProtocol", "Month" = "month", "Day" = "day",
  #                    "Year" = "year", "County" = "county", "Genus" = "genus", "Species" = "specificEpithet" ,
  #                    "Latitude" = "decimalLatitude", "Longitude" = "decimalLongitude")
  # iNatFolder = "C:\\Users\\s_robinson\\Ducks Unlimited Canada\\IWWR Team - Documents\\Sustainable Agriculture\\External Collaborative Projects\\OSU Vineyard Project 2024-26\\stewardshipReports2026\\inatCSVs\\"
  # reportFolder = "C:\\Users\\s_robinson\\Ducks Unlimited Canada\\IWWR Team - Documents\\Sustainable Agriculture\\External Collaborative Projects\\OSU Vineyard Project 2024-26\\stewardshipReports2026\\reportFolder\\"
  # reportTitles = paste0('Report ',LETTERS[1:15])
  # plDatCSV = NA
  # missingPlDatCSV = NA
  # predictedBeesCSV = NA
  # dataStoragePath = NA
  # beeAbstractsPath = NA
  # vy = 1
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
  
  #Run cleanReportData, and write results to local environment
  list2env(
    cleanReportData(plantListCSV = plantListCSV,beeDataCSV = beeDataCSV, 
                    beeDataColumns = beeDataColumns,iNatFolder = iNatFolder,
                    plDatCSV = plDatCSV,missingPlDatCSV = missingPlDatCSV),
    envir = .GlobalEnv
  )
  
  #List of non-native plants - also includes ones not found in complete plant list (possibly misidentified)
  nonNativeSpp <- plantList %>% select(Scientific_name,isNative) %>% 
    filter(grepl('\\s',Scientific_name)) %>% filter(!isNative) %>% 
    pull(Scientific_name)
  
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
  
  if(length(reportTitles)!=length(names(iNatNetworks))) stop(c('reportTitles must have 1 report title per project. ',length(reportTitles),' report titles provided, but ',length(names(iNatNetworks)),' iNat projects present in data.'))

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
    
      # suppressWarnings({
        render(rmdPath,
               output_file = paste0(names(iNatNetworks)[vy],'-report'),
               output_format = "pdf_document",
               output_dir = reportFolder,
               # intermediates_dir = reportFolder, #Doesn't produce maps correctly if specified
               knit_root_dir = reportFolder,
               params = list(iNatProj=names(iNatNetworks)[vy],
                             set_title=ifelse(length(reportTitles)==1 && is.na(reportTitles),names(iNatNetworks)[vy],reportTitles[vy])),
               envir=new.env(),
               quiet = TRUE
        )  
      # })
      
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

