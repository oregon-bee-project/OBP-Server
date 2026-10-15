#' @title Create genus/species column
#' @description Creates genus/species column, accounting for empty species labels (adds "spp."). Originally included in _SRtools_ package
#' @param d Data frame or tibble
#' @param genCol Genus column
#' @param sppCol Species column
#' @param newCol New column name (default = genSpp)
#' @return Data frame with new genSpp column
#' @export
#' @examples
#' dat <- data.frame(gen=c('Apis','Bombus','Nomada'),spp=c('mellifera','nevadensis',NA))
#' makeGenSpp(dat,gen,spp)
#' 
makeGenSpp <- function(d,genCol,sppCol,newCol=genSpp) {
  require(dplyr)
  d %>%
    mutate({{newCol}}:=case_when(
      !is.na({{genCol}}) & !is.na({{sppCol}}) ~ paste({{genCol}},{{sppCol}},sep=' '),
      !is.na({{genCol}}) & is.na({{sppCol}}) ~ paste0({{genCol}},' spp.'),
      TRUE ~ NA_character_)
    )
}
