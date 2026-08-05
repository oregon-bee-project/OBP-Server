#Preamble

# install.packages('remotes')
# remotes::install_github('https://github.com/samuelVJrobinson/vineyardReportsOSU')
# library(vineyardReportsOSU)

setwd("/app/vineyardReportsOSU")
devtools::load_all(".")

dirpath <- "/app/data/"

# Create 2025 vineyard reports
makeReports(plantListCSV = paste0(dirpath, "beeline/plants-clean2026-05-08.csv"),
            beeDataCSV = paste0(dirpath, "beeline/workingOccurrences2026-04-01.csv"),
            beeDataColumns = c("CollectorName" = "recordedBy", "Sex" = "sex", "ForagePlant" = "speciesPlant",
                               "Method" = "samplingProtocol", "Month" = "month", "Day" = "day",
                               "Year" = "year", "County" = "county", "Genus" = "genus", "Species" = "specificEpithet" ,
                               "Latitude" = "decimalLatitude", "Longitude" = "decimalLongitude"),
            iNatFolder = paste0(dirpath, "inat/"),
            reportFolder = paste0(dirpath, "reports/"),
            plDatCSV = NA, 
            predictedBeesCSV = NA, 
            dataStoragePath = NA
)


# Create 2026 regional reports (not vineyard-level)
# debugonce(makeReports2)
# makeReports2(plantListCSV = paste0(dirpath, "beeline/plants-clean2026-05-08.csv"),
#             beeDataCSV = paste0(dirpath, "beeline/workingOccurrences2026-04-01.csv"),
#             beeDataColumns = c("CollectorName" = "recordedBy", "Sex" = "sex", "ForagePlant" = "speciesPlant",
#                                "Method" = "samplingProtocol", "Month" = "month", "Day" = "day",
#                                "Year" = "year", "County" = "county", "Genus" = "genus", "Species" = "specificEpithet" ,
#                                "Latitude" = "decimalLatitude", "Longitude" = "decimalLongitude"),
#             # I think this is supposed to be the project we're examining
#             iNatFolder = paste0(dirpath, "inat/"),
#             reportFolder = paste0(dirpath, "reports/"),
#             plDatCSV = NA, 
#             predictedBeesCSV = NA, 
#             dataStoragePath = NA
#)




# Optional paths?
# famGenPath = "C:\\Users\\s_robinson\\OneDrive - Ducks Unlimited Canada\\Documents\\Projects\\Git Repos\\vineyardReportsOSU\\inst\\extdata\\famGenLookup.csv"
# ecoregShpPath = "C:\\Users\\s_robinson\\Ducks Unlimited Canada\\IWWR Team - Documents\\Sustainable Agriculture\\External Collaborative Projects\\OSU Vineyard Project 2024-26\\data\\shapefiles\\NA_ecoregions.gpkg"
# stateProvShpPath = "C:\\Users\\s_robinson\\Ducks Unlimited Canada\\IWWR Team - Documents\\Sustainable Agriculture\\External Collaborative Projects\\OSU Vineyard Project 2024-26\\data\\shapefiles\\NA_statesProvs.gpkg"
# beeAbstractsPath = NA
# vy = 1
# rmdPath = "C:\\Users\\s_robinson\\OneDrive - Ducks Unlimited Canada\\Documents\\Projects\\Git Repos\\vineyardReportsOSU\\inst\\rmdTemplates\\ecoregion-report-template.Rmd"



# makeReports(plantListCSV = "C:\\Users\\s_robinson\\Ducks Unlimited Canada\\IWWR Team - Documents\\Sustainable Agriculture\\External Collaborative Projects\\OSU Vineyard Project 2024-26\\stewardshipReports2026\\PLANTS_CLEAN_2026-05-08.csv",
#             beeDataCSV = "C:\\Users\\s_robinson\\Ducks Unlimited Canada\\IWWR Team - Documents\\Sustainable Agriculture\\External Collaborative Projects\\OSU Vineyard Project 2024-26\\stewardshipReports2026\\workingOccurrences2026_04_01.csv",
#             beeDataColumns =  c("CollectorName" = "recordedBy", "Sex" = "sex", "ForagePlant" = "speciesPlant",
#                                 "Method" = "samplingProtocol", "Month" = "month", "Day" = "day",
#                                 "Year" = "year", "County" = "county", "Genus" = "genus", "Species" = "specificEpithet" ,
#                                 "Latitude" = "decimalLatitude", "Longitude" = "decimalLongitude"),
#             iNatFolder =  file.path(dirpath,'/data/records'),
#             reportFolder = paste0(dirpath,'/reports2026'),
#             vinePlDatCSV = paste0(dirpath,'/reports2026/vinePlDat.csv'),
#             predictedBeesCSV = paste0(dirpath,'/reports2026/predictedBees.csv'),
#             dataStoragePath = paste0(dirpath,'/reports2026/allDatStorage.Rdata'))

#Output paths - optional
# vinePlDatCSV = NULL; predictedBeesCSV = NULL; dataStoragePath = NULL

# #Built-in paths - optional
# famGenPath <- './data/famGenLookup.csv' # Bee genus-family lookup table
# orCountyShpPath <- "./data/shapefiles/orcntypoly.shp" #Oregon county polygons
# orEcoregShpPath <- "./data/shapefiles/or_eco_l3.shp" #Ecoregion county polygons
# beeAbstractsPath <- './data/Bee_Abstracts.csv' # Bee abstracts


