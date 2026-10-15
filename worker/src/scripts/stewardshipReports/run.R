setwd("/app/")
devtools::load_all('./src/scripts/stewardshipReports')

args <- commandArgs(trailingOnly=TRUE)

if (length(args) < 4) {
  stop("Required args: plantList, occurrences, observations, output-directory")
}

plantListCSV <- normalizePath(args[1], mustWork=TRUE)
beeDataCSV <- normalizePath(args[2], mustWork=TRUE)
iNatFolder <- normalizePath(args[3], mustWork=TRUE)
reportFolder <- normalizePath(args[4], mustWork=TRUE)

cat("Running makeReports2 with following inputs: ", 
  args[1], args[2], args[3], args[4], '\n'
)

makeReports2(plantListCSV = plantListCSV,
            beeDataCSV = beeDataCSV,
            beeDataColumns = c("CollectorName" = "recordedBy", "Sex" = "sex", "ForagePlant" = "speciesPlant",
                               "Method" = "samplingProtocol", "Month" = "month", "Day" = "day",
                               "Year" = "year", "County" = "county", "Genus" = "genus", "Species" = "specificEpithet" ,
                               "Latitude" = "decimalLatitude", "Longitude" = "decimalLongitude"),
            iNatFolder = iNatFolder,
            reportFolder = reportFolder,
            plDatCSV = NA, 
            predictedBeesCSV = NA, 
            dataStoragePath = NA
)
