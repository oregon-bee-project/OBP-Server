# OBP entry point for the vineyardReportsOSU package in this directory.
# Everything else here is a copy of upstream
# https://github.com/samuelVJrobinson/vineyardReportsOSU at 58b6f0f; to update, copy upstream over it
# and keep OBP-specific handling in this script and StewardshipReportSubtaskHandler.js.
#
# Local patches to inst/rmdTemplates/ecoregion-report-template.Rmd to reapply after updating (drop each once
# upstream has an equivalent):
# - The cover title is {\Huge\bfseries ...\par} rather than \textbf{\Huge{...}}, which microtype 3.1a
#   (TeX Live 2023, as in the worker image) fails to compile inside the center environment
# - \graphicspath set to the template's folder, so its ../extdata image paths still resolve now that
#   rmarkdown >= 2.32 runs LaTeX in the output directory instead of the template's
# - Missing period added after "We didn't find many super bee plants at your site"
# - "ecroegion" typo fixed

setwd("/app/")
devtools::load_all('./src/scripts/stewardshipReports')

args <- commandArgs(trailingOnly=TRUE)

if (length(args) < 5) {
  stop("Required args: plantList, occurrences, observations, output-directory, report-title")
}

plantListCSV <- normalizePath(args[1], mustWork=TRUE)
beeDataCSV <- normalizePath(args[2], mustWork=TRUE)
iNatFolder <- normalizePath(args[3], mustWork=TRUE)
reportFolder <- normalizePath(args[4], mustWork=TRUE)
reportTitle <- args[5]

cat("Running makeReports2 with following inputs: ",
  args[1], args[2], args[3], args[4], reportTitle, '\n'
)

makeReports2(plantListCSV = plantListCSV,
            beeDataCSV = beeDataCSV,
            beeDataColumns = c("CollectorName" = "recordedBy", "Sex" = "sex", "ForagePlant" = "speciesPlant",
                               "Method" = "samplingProtocol", "Month" = "month", "Day" = "day",
                               "Year" = "year", "County" = "county", "Genus" = "genus", "Species" = "specificEpithet" ,
                               "Latitude" = "decimalLatitude", "Longitude" = "decimalLongitude"),
            iNatFolder = iNatFolder,
            reportFolder = reportFolder,
            reportTitles = reportTitle,
            plDatCSV = NA,
            missingPlDatCSV = file.path(reportFolder, 'plantDataSummary.csv'),
            predictedBeesCSV = NA,
            dataStoragePath = NA
)

# makeReports2 names the PDF after the iNat project; the handler expects report.pdf
reportPDFs <- list.files(reportFolder, pattern = '-report\\.pdf$', full.names = TRUE)
if (length(reportPDFs) != 1) {
  stop(paste0('Expected 1 report PDF in ', reportFolder, ', found ', length(reportPDFs)))
}
if (!file.rename(reportPDFs, file.path(reportFolder, 'report.pdf'))) {
  stop(paste0('Failed to rename ', reportPDFs, ' to report.pdf'))
}
